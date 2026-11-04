import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	lt,
	type SQL,
	sql,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { issueLabels, issueStatuses, issues, projects } from "../db/schema";
import type { Database } from "../db/types";
import type {
	IssueDto,
	ListIssuesDto,
	ListIssuesQueryDto,
} from "../dto/issue.dto";
import type { StatusDto } from "../dto/status.dto";
import { type ActivityInsert, activityInsertStatement } from "./activity.dao";
import { deleteRelationsForIssueStatement } from "./relation.dao";
import { toStatusDto } from "./status.dao";

type IssueRow = typeof issues.$inferSelect;

/**
 * Upper bound for the sub-issue list returned with an issue. Sub-issues are a
 * planning aid, so the detail view (and its progress bar) stays bounded even
 * for an issue with an unusually large number of children.
 */
export const MAX_SUB_ISSUES = 200;

const escapeLike = (value: string) =>
	value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

const toIssueDto = (row: IssueRow, status: StatusDto): IssueDto => ({
	...row,
	dueDate: row.dueDate ? row.dueDate.toISOString() : null,
	deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
	status,
});

const requireStatus = (map: Map<string, StatusDto>, statusId: string) => {
	const status = map.get(statusId);
	if (!status) {
		throw new Error(`Issue references unknown status ${statusId}`);
	}
	return status;
};

const isConstraintViolation = (err: unknown) =>
	err instanceof Error && /constraint failed/i.test(err.message);

const MAX_INSERT_ATTEMPTS = 3;

export const createIssueDao = (db: Database) => {
	const describeIssue = async (row: IssueRow): Promise<IssueDto> => {
		const status = await db
			.select()
			.from(issueStatuses)
			.where(eq(issueStatuses.id, row.statusId))
			.get();
		if (!status) {
			throw new Error(`Issue references unknown status ${row.statusId}`);
		}
		return toIssueDto(row, toStatusDto(status));
	};

	return {
		createWithNumber: async (
			data: {
				id: string;
				orgId: string;
				projectId: string;
				title: string;
				description: string | null;
				statusId: string;
				priority: number;
				assigneeId: string | null;
				createdById: string | null;
				dueDate: Date | null;
				estimate: number | null;
				parentId: string | null;
			},
			labelIds: string[],
			activityRows: ActivityInsert[] = [],
		): Promise<IssueDto> => {
			let lastError: unknown;
			for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
				try {
					const [, inserted] = await db.batch([
						db
							.update(projects)
							.set({ nextNumber: sql`${projects.nextNumber} + 1` })
							.where(
								and(
									eq(projects.orgId, data.orgId),
									eq(projects.id, data.projectId),
								),
							),
						db
							.insert(issues)
							.values({
								...data,
								number: sql`(
									select ${projects.nextNumber} - 1
									from ${projects}
									where ${projects.id} = ${data.projectId}
										and ${projects.orgId} = ${data.orgId}
								)`,
							})
							.returning(),
						...(labelIds.length
							? [
									db.insert(issueLabels).values(
										labelIds.map((labelId) => ({
											issueId: data.id,
											labelId,
										})),
									),
								]
							: []),
						...(activityRows.length
							? [activityInsertStatement(db, activityRows)]
							: []),
					]);
					const status = await db
						.select()
						.from(issueStatuses)
						.where(eq(issueStatuses.id, data.statusId))
						.get();
					if (!status) {
						throw new Error(`Unknown status ${data.statusId}`);
					}
					return toIssueDto(inserted[0], toStatusDto(status));
				} catch (err) {
					lastError = err;
					if (!isConstraintViolation(err)) {
						throw err;
					}
				}
			}
			throw lastError;
		},

		findById: async (orgId: string, id: string): Promise<IssueDto | null> => {
			const row = await db
				.select()
				.from(issues)
				.where(
					and(
						eq(issues.orgId, orgId),
						eq(issues.id, id),
						isNull(issues.deletedAt),
					),
				)
				.get();
			if (!row) {
				return null;
			}
			const status = await db
				.select()
				.from(issueStatuses)
				.where(eq(issueStatuses.id, row.statusId))
				.get();
			return status ? toIssueDto(row, toStatusDto(status)) : null;
		},

		findByProjectAndNumber: async (
			orgId: string,
			projectId: string,
			number: number,
		): Promise<IssueDto | null> => {
			const row = await db
				.select()
				.from(issues)
				.where(
					and(
						eq(issues.orgId, orgId),
						eq(issues.projectId, projectId),
						eq(issues.number, number),
						isNull(issues.deletedAt),
					),
				)
				.get();
			if (!row) {
				return null;
			}
			const status = await db
				.select()
				.from(issueStatuses)
				.where(eq(issueStatuses.id, row.statusId))
				.get();
			return status ? toIssueDto(row, toStatusDto(status)) : null;
		},

		findByIds: async (orgId: string, ids: string[]): Promise<IssueDto[]> => {
			if (ids.length === 0) {
				return [];
			}
			const [rows, statusRows] = await Promise.all([
				db
					.select()
					.from(issues)
					.where(
						and(
							eq(issues.orgId, orgId),
							inArray(issues.id, ids),
							isNull(issues.deletedAt),
						),
					),
				db.select().from(issueStatuses).where(eq(issueStatuses.orgId, orgId)),
			]);
			const statusById = new Map(
				statusRows.map((status) => [status.id, toStatusDto(status)]),
			);
			return rows.map((row) =>
				toIssueDto(row, requireStatus(statusById, row.statusId)),
			);
		},

		/** Non-deleted direct children of a parent issue (capped, see MAX_SUB_ISSUES). */
		findChildren: async (
			orgId: string,
			parentId: string,
		): Promise<IssueDto[]> => {
			const [rows, statusRows] = await Promise.all([
				db
					.select()
					.from(issues)
					.where(
						and(
							eq(issues.orgId, orgId),
							eq(issues.parentId, parentId),
							isNull(issues.deletedAt),
						),
					)
					.orderBy(asc(issues.number))
					.limit(MAX_SUB_ISSUES),
				db.select().from(issueStatuses).where(eq(issueStatuses.orgId, orgId)),
			]);
			const statusById = new Map(
				statusRows.map((status) => [status.id, toStatusDto(status)]),
			);
			return rows.map((row) =>
				toIssueDto(row, requireStatus(statusById, row.statusId)),
			);
		},

		hasChildren: async (orgId: string, parentId: string): Promise<boolean> => {
			const [row] = await db
				.select({ value: count() })
				.from(issues)
				.where(
					and(
						eq(issues.orgId, orgId),
						eq(issues.parentId, parentId),
						isNull(issues.deletedAt),
					),
				);
			return (row?.value ?? 0) > 0;
		},

		findPrevNumber: async (
			orgId: string,
			projectId: string,
			number: number,
		): Promise<number | null> => {
			const row = await db
				.select({ number: issues.number })
				.from(issues)
				.where(
					and(
						eq(issues.orgId, orgId),
						eq(issues.projectId, projectId),
						lt(issues.number, number),
						isNull(issues.deletedAt),
					),
				)
				.orderBy(desc(issues.number))
				.limit(1)
				.get();
			return row?.number ?? null;
		},

		findNextNumber: async (
			orgId: string,
			projectId: string,
			number: number,
		): Promise<number | null> => {
			const row = await db
				.select({ number: issues.number })
				.from(issues)
				.where(
					and(
						eq(issues.orgId, orgId),
						eq(issues.projectId, projectId),
						gt(issues.number, number),
						isNull(issues.deletedAt),
					),
				)
				.orderBy(asc(issues.number))
				.limit(1)
				.get();
			return row?.number ?? null;
		},

		list: async (
			orgId: string,
			projectId: string | null,
			query: ListIssuesQueryDto,
		): Promise<ListIssuesDto> => {
			const conditions: SQL[] = [
				eq(issues.orgId, orgId),
				isNull(issues.deletedAt),
			];
			if (projectId) {
				conditions.push(eq(issues.projectId, projectId));
			}
			if (query.projectId) {
				conditions.push(eq(issues.projectId, query.projectId));
			}
			if (query.statusId?.length) {
				conditions.push(inArray(issues.statusId, query.statusId));
			}
			if (query.priority?.length) {
				conditions.push(inArray(issues.priority, query.priority));
			}
			if (query.assigneeId === "none") {
				conditions.push(isNull(issues.assigneeId));
			} else if (query.assigneeId) {
				conditions.push(eq(issues.assigneeId, query.assigneeId));
			}
			if (query.labelId) {
				conditions.push(
					inArray(
						issues.id,
						db
							.select({ id: issueLabels.issueId })
							.from(issueLabels)
							.where(eq(issueLabels.labelId, query.labelId)),
					),
				);
			}
			if (query.search) {
				const pattern = `%${escapeLike(query.search)}%`;
				conditions.push(
					sql`(${issues.title} like ${pattern} escape '\\' or ${issues.description} like ${pattern} escape '\\')`,
				);
			}
			const where = and(...conditions);
			const orderBy =
				query.sort === "created"
					? [desc(issues.createdAt)]
					: query.sort === "priority"
						? [asc(issues.priority), desc(issues.createdAt)]
						: [desc(issues.updatedAt)];

			const [rows, totals] = await db.batch([
				db
					.select()
					.from(issues)
					.where(where)
					.orderBy(...orderBy)
					.limit(query.pageSize)
					.offset((query.page - 1) * query.pageSize),
				db.select({ value: count() }).from(issues).where(where),
			]);

			const issueIds = rows.map((row) => row.id);
			const [statusRows, labelRows] = await Promise.all([
				db.select().from(issueStatuses).where(eq(issueStatuses.orgId, orgId)),
				issueIds.length
					? db
							.select({
								issueId: issueLabels.issueId,
								labelId: issueLabels.labelId,
							})
							.from(issueLabels)
							.where(inArray(issueLabels.issueId, issueIds))
					: Promise.resolve([]),
			]);
			const statusById = new Map(
				statusRows.map((status) => [status.id, toStatusDto(status)]),
			);
			const labelIdsByIssue = new Map<string, string[]>();
			for (const link of labelRows) {
				const list = labelIdsByIssue.get(link.issueId) ?? [];
				list.push(link.labelId);
				labelIdsByIssue.set(link.issueId, list);
			}

			return {
				items: rows.map((row) => ({
					...toIssueDto(row, requireStatus(statusById, row.statusId)),
					labelIds: labelIdsByIssue.get(row.id) ?? [],
				})),
				total: totals[0]?.value ?? 0,
				page: query.page,
				pageSize: query.pageSize,
			};
		},

		update: async (
			orgId: string,
			id: string,
			patch: Partial<{
				title: string;
				description: string | null;
				statusId: string;
				priority: number;
				assigneeId: string | null;
				dueDate: Date | null;
				estimate: number | null;
				parentId: string | null;
			}>,
			labelIds?: string[],
			activityRows: ActivityInsert[] = [],
		): Promise<IssueDto | null> => {
			const patchEntries = Object.fromEntries(
				Object.entries(patch).filter(([, value]) => value !== undefined),
			);
			const scope = and(
				eq(issues.orgId, orgId),
				eq(issues.id, id),
				isNull(issues.deletedAt),
			);
			const needsBatch = labelIds !== undefined || activityRows.length > 0;
			if (!needsBatch) {
				if (Object.keys(patchEntries).length === 0) {
					const current = await db.select().from(issues).where(scope).get();
					return current ? describeIssue(current) : null;
				}
				const row = await db
					.update(issues)
					.set(patchEntries)
					.where(scope)
					.returning()
					.get();
				return row ? describeIssue(row) : null;
			}
			const hasPatch = Object.keys(patchEntries).length > 0;
			const statements = [
				hasPatch
					? db.update(issues).set(patchEntries).where(scope).returning()
					: db.select().from(issues).where(scope),
				...(labelIds !== undefined
					? [db.delete(issueLabels).where(eq(issueLabels.issueId, id))]
					: []),
			] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
			if (labelIds !== undefined && labelIds.length > 0) {
				statements.push(
					db
						.insert(issueLabels)
						.values(labelIds.map((labelId) => ({ issueId: id, labelId }))),
				);
			}
			if (activityRows.length > 0) {
				statements.push(activityInsertStatement(db, activityRows));
			}
			const [baseRows] = await db.batch(statements);
			const row = baseRows[0] as IssueRow | undefined;
			return row ? describeIssue(row) : null;
		},

		/**
		 * Soft-deletes the issue and keeps dependent rows consistent in the same
		 * D1 batch (a transaction):
		 * - direct children are detached (`parent_id = NULL`) so they remain
		 *   top-level issues instead of pointing at a hidden parent;
		 * - every relation involving the issue is removed, from either side.
		 */
		softDelete: async (
			orgId: string,
			id: string,
			activity?: ActivityInsert,
		): Promise<boolean> => {
			const statements = [
				db
					.update(issues)
					.set({ deletedAt: new Date() })
					.where(
						and(
							eq(issues.orgId, orgId),
							eq(issues.id, id),
							isNull(issues.deletedAt),
						),
					)
					.returning({ id: issues.id }),
				db
					.update(issues)
					.set({ parentId: null })
					.where(
						and(
							eq(issues.orgId, orgId),
							eq(issues.parentId, id),
							isNull(issues.deletedAt),
						),
					),
				deleteRelationsForIssueStatement(db, orgId, id),
			] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
			if (activity) {
				statements.push(activityInsertStatement(db, [activity]));
			}
			const [rows] = await db.batch(statements);
			return rows.length > 0;
		},

		findLabelIds: async (issueId: string): Promise<string[]> => {
			const rows = await db
				.select({ labelId: issueLabels.labelId })
				.from(issueLabels)
				.where(eq(issueLabels.issueId, issueId));
			return rows.map((row) => row.labelId);
		},

		replaceLabels: async (
			issueId: string,
			labelIds: string[],
		): Promise<void> => {
			const statements = [
				db.delete(issueLabels).where(eq(issueLabels.issueId, issueId)),
			] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
			if (labelIds.length > 0) {
				statements.push(
					db
						.insert(issueLabels)
						.values(labelIds.map((labelId) => ({ issueId, labelId }))),
				);
			}
			await db.batch(statements);
		},
	};
};

export type IssueDao = ReturnType<typeof createIssueDao>;
