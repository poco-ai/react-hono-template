import { and, count, desc, eq, gte, lte, type SQL, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { auditEvents } from "../db/schema";
import type { Database } from "../db/types";
import { sqlNow } from "../lib/sql-dialect";

export type AuditEventInsert = {
	id: string;
	orgId: string | null;
	actorType: string;
	actorId: string | null;
	action: string;
	targetType: string | null;
	targetId: string | null;
	result: string;
	requestId: string | null;
	ipAddress: string | null;
	userAgent: string | null;
	before: Record<string, unknown> | null;
	after: Record<string, unknown> | null;
};

export type AuditEventRow = AuditEventInsert & {
	createdAt: Date;
};

export type AuditListFilter = {
	orgId?: string;
	action?: string;
	actorId?: string;
	from?: Date;
	to?: Date;
	page: number;
	pageSize: number;
};

const toRow = (row: typeof auditEvents.$inferSelect): AuditEventRow => ({
	id: row.id,
	orgId: row.orgId,
	actorType: row.actorType,
	actorId: row.actorId,
	action: row.action,
	targetType: row.targetType,
	targetId: row.targetId,
	result: row.result,
	requestId: row.requestId,
	ipAddress: row.ipAddress,
	userAgent: row.userAgent,
	before: row.before,
	after: row.after,
	createdAt: row.createdAt,
});

/**
 * Conditional audit insert for a batch whose previous statement is the write
 * being audited. `changes()` is the previous statement's row count, so a
 * delete that removes nothing does not leave an audit row behind.
 */
export const auditInsertWhenStatement = (
	db: Database,
	row: AuditEventInsert,
	condition: SQL,
): BatchItem<"sqlite"> =>
	db.insert(auditEvents).select(sql`
		SELECT ${row.id}, ${row.orgId}, ${row.actorType}, ${row.actorId}, ${row.action},
			${row.targetType}, ${row.targetId}, ${row.result}, ${row.requestId},
			${row.ipAddress}, ${row.userAgent},
			${row.before ? JSON.stringify(row.before) : null},
			${row.after ? JSON.stringify(row.after) : null},
			${sqlNow()}
		WHERE ${condition}
	`);

const filtersFor = (filter: AuditListFilter): SQL | undefined => {
	const parts: SQL[] = [];
	if (filter.orgId) parts.push(eq(auditEvents.orgId, filter.orgId));
	if (filter.action) parts.push(eq(auditEvents.action, filter.action));
	if (filter.actorId) parts.push(eq(auditEvents.actorId, filter.actorId));
	if (filter.from) parts.push(gte(auditEvents.createdAt, filter.from));
	if (filter.to) parts.push(lte(auditEvents.createdAt, filter.to));
	return parts.length > 0 ? and(...parts) : undefined;
};

export const createAuditDao = (db: Database) => ({
	insert: async (row: AuditEventInsert): Promise<void> => {
		await db.insert(auditEvents).values(row);
	},

	insertStatement: (row: AuditEventInsert): BatchItem<"sqlite"> =>
		db.insert(auditEvents).values(row),

	list: async (
		filter: AuditListFilter,
	): Promise<{ items: AuditEventRow[]; total: number }> => {
		const where = filtersFor(filter);
		const [rows, totals] = await Promise.all([
			db
				.select()
				.from(auditEvents)
				.where(where)
				.orderBy(desc(auditEvents.createdAt))
				.limit(filter.pageSize)
				.offset((filter.page - 1) * filter.pageSize),
			db.select({ value: count() }).from(auditEvents).where(where),
		]);
		return {
			items: rows.map(toRow),
			total: totals[0]?.value ?? 0,
		};
	},
});

export type AuditDao = ReturnType<typeof createAuditDao>;
