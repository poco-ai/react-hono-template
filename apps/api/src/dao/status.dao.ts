import { and, asc, count, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { issueStatuses, issues } from "../db/schema";
import type { Database } from "../db/types";
import type { StatusDto } from "../dto/status.dto";
import { statusMigrationActivityStatement } from "./activity.dao";

type StatusRow = typeof issueStatuses.$inferSelect;

const toStatusDto = (row: StatusRow): StatusDto => ({
	...row,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

export { toStatusDto };

const isUniqueViolation = (err: unknown) =>
	err instanceof Error && /unique constraint/i.test(err.message);

export const createStatusDao = (db: Database) => ({
	listByOrg: async (orgId: string): Promise<StatusDto[]> => {
		const rows = await db
			.select()
			.from(issueStatuses)
			.where(eq(issueStatuses.orgId, orgId))
			.orderBy(asc(issueStatuses.position), asc(issueStatuses.name));
		return rows.map(toStatusDto);
	},

	findById: async (orgId: string, id: string): Promise<StatusDto | null> => {
		const row = await db
			.select()
			.from(issueStatuses)
			.where(and(eq(issueStatuses.orgId, orgId), eq(issueStatuses.id, id)))
			.get();
		return row ? toStatusDto(row) : null;
	},

	findByName: async (
		orgId: string,
		name: string,
	): Promise<StatusDto | null> => {
		const row = await db
			.select()
			.from(issueStatuses)
			.where(and(eq(issueStatuses.orgId, orgId), eq(issueStatuses.name, name)))
			.get();
		return row ? toStatusDto(row) : null;
	},

	countByOrg: async (orgId: string): Promise<number> => {
		const [row] = await db
			.select({ value: count() })
			.from(issueStatuses)
			.where(eq(issueStatuses.orgId, orgId));
		return row?.value ?? 0;
	},

	/** Issues (including soft-deleted ones) still pointing at a status. */
	countIssueReferences: async (
		orgId: string,
		statusId: string,
	): Promise<number> => {
		const [row] = await db
			.select({ value: count() })
			.from(issues)
			.where(and(eq(issues.orgId, orgId), eq(issues.statusId, statusId)));
		return row?.value ?? 0;
	},

	create: async (data: {
		id: string;
		orgId: string;
		name: string;
		category: string;
		color: string;
		position: number;
		isDefault: boolean;
	}): Promise<StatusDto> => {
		const row = await db.insert(issueStatuses).values(data).returning().get();
		return toStatusDto(row);
	},

	insertMany: async (
		rows: {
			id: string;
			orgId: string;
			name: string;
			category: string;
			color: string;
			position: number;
			isDefault: boolean;
		}[],
	): Promise<void> => {
		if (rows.length === 0) {
			return;
		}
		await db.insert(issueStatuses).values(rows);
	},

	update: async (
		orgId: string,
		id: string,
		patch: Partial<{ name: string; category: string; color: string }>,
	): Promise<StatusDto | null> => {
		const patchEntries = Object.fromEntries(
			Object.entries(patch).filter(([, value]) => value !== undefined),
		);
		if (Object.keys(patchEntries).length === 0) {
			const current = await db
				.select()
				.from(issueStatuses)
				.where(and(eq(issueStatuses.orgId, orgId), eq(issueStatuses.id, id)))
				.get();
			return current ? toStatusDto(current) : null;
		}
		const row = await db
			.update(issueStatuses)
			.set(patchEntries)
			.where(and(eq(issueStatuses.orgId, orgId), eq(issueStatuses.id, id)))
			.returning()
			.get();
		return row ? toStatusDto(row) : null;
	},

	/** Makes `id` the only default status of the organization. */
	setDefault: async (orgId: string, id: string): Promise<StatusDto | null> => {
		const [, rows] = await db.batch([
			db
				.update(issueStatuses)
				.set({ isDefault: false })
				.where(eq(issueStatuses.orgId, orgId)),
			db
				.update(issueStatuses)
				.set({ isDefault: true })
				.where(and(eq(issueStatuses.orgId, orgId), eq(issueStatuses.id, id)))
				.returning(),
		]);
		const row = rows[0];
		return row ? toStatusDto(row) : null;
	},

	reorder: async (
		orgId: string,
		ordered: { id: string; position: number }[],
	): Promise<void> => {
		if (ordered.length === 0) {
			return;
		}
		const statements = ordered.map((entry) =>
			db
				.update(issueStatuses)
				.set({ position: entry.position })
				.where(
					and(eq(issueStatuses.orgId, orgId), eq(issueStatuses.id, entry.id)),
				),
		);
		await db.batch(
			statements as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
		);
	},

	/**
	 * Moves every issue (soft-deleted included) to the migration target, records
	 * the status change activities, deletes the status and optionally promotes a
	 * new default. One D1 batch keeps the writes atomic.
	 */
	deleteWithMigration: async ({
		orgId,
		id,
		migrateToId,
		migrateToName,
		oldStatusName,
		actorId,
		promoteDefaultId,
	}: {
		orgId: string;
		id: string;
		migrateToId?: string;
		migrateToName?: string;
		oldStatusName: string;
		actorId: string;
		promoteDefaultId?: string;
	}): Promise<boolean> => {
		const statements: BatchItem<"sqlite">[] = [];
		let migrateStatementCount = 0;
		if (migrateToId && migrateToName) {
			migrateStatementCount = 2;
			// Written before the update so the SELECT still sees the old status.
			statements.push(
				statusMigrationActivityStatement(db, {
					orgId,
					statusId: id,
					actorId,
					oldStatusName,
					newStatusName: migrateToName,
				}),
			);
			statements.push(
				db
					.update(issues)
					.set({ statusId: migrateToId })
					.where(and(eq(issues.orgId, orgId), eq(issues.statusId, id))),
			);
		}
		statements.push(
			db
				.delete(issueStatuses)
				.where(and(eq(issueStatuses.orgId, orgId), eq(issueStatuses.id, id)))
				.returning({ id: issueStatuses.id }),
		);
		if (promoteDefaultId) {
			// Clear the previous default first: the partial unique index allows
			// only one is_default row per organization.
			statements.push(
				db
					.update(issueStatuses)
					.set({ isDefault: false })
					.where(eq(issueStatuses.orgId, orgId)),
				db
					.update(issueStatuses)
					.set({ isDefault: true })
					.where(
						and(
							eq(issueStatuses.orgId, orgId),
							eq(issueStatuses.id, promoteDefaultId),
						),
					),
			);
		}
		const results = await db.batch(
			statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
		);
		const deleted = results[migrateStatementCount] as
			| { id: string }[]
			| undefined;
		return (deleted?.length ?? 0) > 0;
	},
});

export type StatusDao = ReturnType<typeof createStatusDao>;

export const isStatusUniqueViolation = isUniqueViolation;
