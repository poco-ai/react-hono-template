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
import { activities, issueLabels, issues, projects } from "../db/schema";
import type { Database } from "../db/types";
import type {
	IssueDto,
	ListIssuesDto,
	ListIssuesQueryDto,
} from "../dto/issue.dto";
import type { ActivityInsert } from "./activity.dao";

type IssueRow = typeof issues.$inferSelect;

const escapeLike = (value: string) =>
	value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

const toIssueDto = (row: IssueRow): IssueDto => ({
	...row,
	dueDate: row.dueDate ? row.dueDate.toISOString() : null,
	deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const isConstraintViolation = (err: unknown) =>
	err instanceof Error && /constraint failed/i.test(err.message);

const MAX_INSERT_ATTEMPTS = 3;

export const createIssueDao = (db: Database) => ({
	createWithNumber: async (
		data: {
			id: string;
			orgId: string;
			projectId: string;
			title: string;
			description: string | null;
			status: string;
			priority: number;
			assigneeId: string | null;
			createdById: string | null;
			dueDate: Date | null;
			estimate: number | null;
		},
		labelIds: string[],
		activity?: ActivityInsert,
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
					...(activity ? [db.insert(activities).values(activity)] : []),
				]);
				return toIssueDto(inserted[0]);
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
		return row ? toIssueDto(row) : null;
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
		return row ? toIssueDto(row) : null;
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
		if (query.status?.length) {
			conditions.push(inArray(issues.status, query.status));
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
		const labelRows = issueIds.length
			? await db
					.select({
						issueId: issueLabels.issueId,
						labelId: issueLabels.labelId,
					})
					.from(issueLabels)
					.where(inArray(issueLabels.issueId, issueIds))
			: [];
		const labelIdsByIssue = new Map<string, string[]>();
		for (const link of labelRows) {
			const list = labelIdsByIssue.get(link.issueId) ?? [];
			list.push(link.labelId);
			labelIdsByIssue.set(link.issueId, list);
		}

		return {
			items: rows.map((row) => ({
				...toIssueDto(row),
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
			status: string;
			priority: number;
			assigneeId: string | null;
			dueDate: Date | null;
			estimate: number | null;
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
				return current ? toIssueDto(current) : null;
			}
			const row = await db
				.update(issues)
				.set(patchEntries)
				.where(scope)
				.returning()
				.get();
			return row ? toIssueDto(row) : null;
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
			statements.push(db.insert(activities).values(activityRows));
		}
		const [baseRows] = await db.batch(statements);
		const row = baseRows[0] as IssueRow | undefined;
		return row ? toIssueDto(row) : null;
	},

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
		] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
		if (activity) {
			statements.push(db.insert(activities).values(activity));
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

	replaceLabels: async (issueId: string, labelIds: string[]): Promise<void> => {
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
});

export type IssueDao = ReturnType<typeof createIssueDao>;
