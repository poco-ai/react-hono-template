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
	TriageIssueDto,
} from "../dto/issue.dto";
import type { StatusDto } from "../dto/status.dto";
import { compileIssueFilter, issueSortOrderBy } from "../lib/issue-filter";
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

const toIssueDto = (row: IssueRow, status: StatusDto): IssueDto => ({
	...row,
	dueDate: row.dueDate ? row.dueDate.toISOString() : null,
	deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
	archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
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

/**
 * D1 caps bound parameters per prepared statement (~100). Issue inserts use
 * ~15 parameters per row, label links 2 and activity rows 10, so bulk import
 * splits every statement into small chunks. All chunks still ride in ONE
 * `db.batch`, which D1 executes as a transaction.
 */
const ISSUE_INSERT_CHUNK = 6;
const LABEL_LINK_INSERT_CHUNK = 40;
const ACTIVITY_INSERT_CHUNK = 8;

/**
 * Upper bound for the serialized SQL payload of one bulk statement. D1 rejects
 * oversized statements; a single 20k-character description per row means the
 * row-count cap alone is not enough (six rows of 20k exceed 60KB). Chunks are
 * split by both the row cap and this UTF-8 byte budget.
 */
export const ISSUE_STATEMENT_MAX_BYTES = 60_000;

/** Approximate per-row SQL overhead (column names, placeholders, subquery). */
const ROW_SQL_OVERHEAD_BYTES = 400;

const byteLength = (value: string): number =>
	new TextEncoder().encode(value).length;

/**
 * Splits rows into statements bounded by both a row count (parameter limits)
 * and serialized UTF-8 bytes (D1 statement size). A single oversized row still
 * produces its own chunk so imports never silently drop data.
 */
export const chunkRowsByBudget = <T>(
	items: readonly T[],
	maxRows: number,
	maxBytes: number = ISSUE_STATEMENT_MAX_BYTES,
): T[][] => {
	const chunks: T[][] = [];
	let current: T[] = [];
	let bytes = 0;
	for (const item of items) {
		const size =
			byteLength(
				item === null || item === undefined ? "" : JSON.stringify(item),
			) + ROW_SQL_OVERHEAD_BYTES;
		if (
			current.length > 0 &&
			(current.length >= maxRows || bytes + size > maxBytes)
		) {
			chunks.push(current);
			current = [];
			bytes = 0;
		}
		current.push(item);
		bytes += size;
	}
	if (current.length > 0) {
		chunks.push(current);
	}
	return chunks;
};

export type IssueInsertData = {
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
	cycleId: string | null;
};

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
				cycleId: string | null;
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

		/**
		 * Bulk insert for CSV import. One batch (transaction) bumps
		 * `projects.nextNumber` once and assigns contiguous numbers to every
		 * row; a mid-batch failure rolls back both the counter and the rows.
		 * Rows are inserted in input order, so row N gets number base + N.
		 */
		createManyWithNumbers: async (
			orgId: string,
			projectId: string,
			rows: IssueInsertData[],
			labelLinks: { issueId: string; labelId: string }[],
			activityRows: ActivityInsert[] = [],
		): Promise<void> => {
			if (rows.length === 0) {
				return;
			}
			const total = rows.length;
			const issueStatements = chunkRowsByBudget(rows, ISSUE_INSERT_CHUNK).map(
				(chunkRows) => {
					const startIndex = rows.indexOf(chunkRows[0]);
					return db.insert(issues).values(
						chunkRows.map((row, offset) => ({
							...row,
							number: sql`(
								select ${projects.nextNumber} - ${total - startIndex - offset}
								from ${projects}
								where ${projects.id} = ${projectId}
									and ${projects.orgId} = ${orgId}
							)`,
						})),
					);
				},
			);
			const labelStatements = chunkRowsByBudget(
				labelLinks,
				LABEL_LINK_INSERT_CHUNK,
			).map((links) => db.insert(issueLabels).values(links));
			const activityStatements = chunkRowsByBudget(
				activityRows,
				ACTIVITY_INSERT_CHUNK,
			).map((activities) => activityInsertStatement(db, activities));

			let lastError: unknown;
			for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
				try {
					await db.batch([
						db
							.update(projects)
							.set({ nextNumber: sql`${projects.nextNumber} + ${total}` })
							.where(
								and(eq(projects.orgId, orgId), eq(projects.id, projectId)),
							),
						...issueStatements,
						...labelStatements,
						...activityStatements,
					] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
					return;
				} catch (err) {
					lastError = err;
					if (!isConstraintViolation(err)) {
						throw err;
					}
				}
			}
			throw lastError;
		},

		/**
		 * Export projection: active (not deleted, not archived) issues of one
		 * project in display order. `total` lets the caller report truncation.
		 */
		listForExport: async (
			orgId: string,
			projectId: string,
			limit: number,
		): Promise<{ rows: IssueRow[]; total: number }> => {
			const where = and(
				eq(issues.orgId, orgId),
				eq(issues.projectId, projectId),
				isNull(issues.deletedAt),
				isNull(issues.archivedAt),
			);
			const [rows, totals] = await Promise.all([
				db
					.select()
					.from(issues)
					.where(where)
					.orderBy(asc(issues.number))
					.limit(limit)
					.all(),
				db.select({ value: count() }).from(issues).where(where),
			]);
			return { rows, total: totals[0]?.value ?? 0 };
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

		/** Non-deleted, non-archived direct children of a parent issue (capped, see MAX_SUB_ISSUES). */
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
							isNull(issues.archivedAt),
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
						isNull(issues.archivedAt),
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
						isNull(issues.archivedAt),
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
						isNull(issues.archivedAt),
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
			// Archived issues stay out of every list unless explicitly requested.
			if (!query.includeArchived) {
				conditions.push(isNull(issues.archivedAt));
			}
			if (projectId) {
				conditions.push(eq(issues.projectId, projectId));
			}
			if (query.projectId) {
				conditions.push(eq(issues.projectId, query.projectId));
			}
			if (query.cycleId) {
				conditions.push(eq(issues.cycleId, query.cycleId));
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
				// `instr` avoids D1's 50-byte LIKE-pattern limit (long CJK terms)
				// and treats `%`/`_` literally, so no escaping is needed.
				conditions.push(
					sql`(instr(lower(${issues.title}), lower(${query.search})) > 0 or instr(lower(coalesce(${issues.description}, '')), lower(${query.search})) > 0)`,
				);
			}
			// Structured filters AND-combine with the legacy flat parameters.
			if (query.filter) {
				const compiled = compileIssueFilter(db, query.filter);
				if (compiled) {
					conditions.push(compiled);
				}
			}
			const where = and(...conditions);
			const orderBy: SQL[] = query.sorts?.length
				? issueSortOrderBy(query.sorts)
				: query.sort === "created"
					? [desc(issues.createdAt), asc(issues.id)]
					: query.sort === "priority"
						? [asc(issues.priority), desc(issues.createdAt), asc(issues.id)]
						: [desc(issues.updatedAt), asc(issues.id)];

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
				cycleId: string | null;
				/** Archival timestamp (null restores). */
				archivedAt: Date | null;
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

		/**
		 * Sets or clears `archivedAt`. The optional activity row rides in the
		 * same D1 batch so archiving and its history entry stay atomic.
		 */
		setArchived: async (
			orgId: string,
			id: string,
			archivedAt: Date | null,
			activity?: ActivityInsert,
		): Promise<IssueDto | null> => {
			const statements = [
				db
					.update(issues)
					.set({ archivedAt })
					.where(
						and(
							eq(issues.orgId, orgId),
							eq(issues.id, id),
							isNull(issues.deletedAt),
						),
					)
					.returning(),
				...(activity ? [activityInsertStatement(db, [activity])] : []),
			] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
			const [baseRows] = await db.batch(statements);
			const row = baseRows[0] as IssueRow | undefined;
			return row ? describeIssue(row) : null;
		},

		/**
		 * Triage queue: backlog-category issues without an assignee, newest
		 * first, capped at 100. Archived, deleted and archived-project issues are
		 * excluded; `projectId` narrows the queue to one project.
		 */
		listTriage: async (
			orgId: string,
			projectId?: string,
		): Promise<TriageIssueDto[]> => {
			const conditions: SQL[] = [
				eq(issues.orgId, orgId),
				isNull(issues.deletedAt),
				isNull(issues.archivedAt),
				isNull(issues.assigneeId),
				eq(issueStatuses.category, "backlog"),
				eq(projects.archived, false),
			];
			if (projectId) {
				conditions.push(eq(issues.projectId, projectId));
			}
			const rows = await db
				.select({
					id: issues.id,
					projectId: issues.projectId,
					// Joined columns need unique SQL names — see drizzle-orm#6038.
					projectKey: projects.key.as("triage_project_key"),
					number: issues.number,
					title: issues.title,
					statusId: issues.statusId,
					statusName: issueStatuses.name.as("triage_status_name"),
					statusCategory: issueStatuses.category.as("triage_status_category"),
					statusColor: issueStatuses.color.as("triage_status_color"),
					priority: issues.priority,
					createdById: issues.createdById,
					createdAt: issues.createdAt,
				})
				.from(issues)
				.innerJoin(projects, eq(projects.id, issues.projectId))
				.innerJoin(issueStatuses, eq(issueStatuses.id, issues.statusId))
				.where(and(...conditions))
				.orderBy(desc(issues.createdAt), asc(issues.id))
				.limit(100)
				.all();
			return rows.map((row) => ({
				...row,
				identifier: `${row.projectKey}-${row.number}`,
				createdAt: row.createdAt.toISOString(),
			}));
		},

		findLabelIds: async (issueId: string): Promise<string[]> => {
			const rows = await db
				.select({ labelId: issueLabels.labelId })
				.from(issueLabels)
				.where(eq(issueLabels.issueId, issueId));
			return rows.map((row) => row.labelId);
		},

		/** Label links for every active issue of a project (export hydration). */
		listLabelLinksForProject: async (
			orgId: string,
			projectId: string,
		): Promise<{ issueId: string; labelId: string }[]> =>
			db
				.select({
					issueId: issueLabels.issueId,
					labelId: issueLabels.labelId,
				})
				.from(issueLabels)
				.innerJoin(issues, eq(issues.id, issueLabels.issueId))
				.where(
					and(
						eq(issues.orgId, orgId),
						eq(issues.projectId, projectId),
						isNull(issues.deletedAt),
						isNull(issues.archivedAt),
					),
				),

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
