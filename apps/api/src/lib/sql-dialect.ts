import { type SQL, sql } from "drizzle-orm";
import { sqlProfile } from "../db/sql-profile";
import type { Database } from "../db/types";

type SqlExpr = SQL | { _: unknown };

export { type SqlProfile, sqlProfile } from "../db/sql-profile";

export const includesLower = (expr: SqlExpr, token: string): SQL =>
	sqlProfile().includes(expr, token);

export const includesTrigram = (expr: SqlExpr, token: string): SQL =>
	sqlProfile().trigram(expr, token);

export const archivedIsFalse = (alias: string): SQL =>
	sqlProfile().archivedIsFalse(alias);

export const sqlNow = (): SQL => sqlProfile().now;

export const sqlRandomId = (): SQL => sqlProfile().randomId;

/** `WHERE` fragments that are boolean on both dialects (`1 = 0` / `1 = 1`). */
export const sqlMatchNone = (): SQL => sql`1 = 0`;

export const sqlMatchAll = (): SQL => sql`1 = 1`;

type RowQuery = {
	all?: (query: SQL) => Promise<unknown>;
	execute?: (query: SQL) => Promise<unknown>;
};

/** Raw SELECT rows. D1 and bun:sqlite expose `all`; postgres-js exposes `execute`. */
export const queryRows = async <T>(db: Database, query: SQL): Promise<T[]> => {
	const executor = db as Database & RowQuery;
	if (sqlProfile().dialect === "postgres") {
		const result = await executor.execute?.(query);
		if (Array.isArray(result)) return result as T[];
		if (
			result &&
			typeof result === "object" &&
			"rows" in result &&
			Array.isArray((result as { rows: unknown }).rows)
		) {
			return (result as { rows: T[] }).rows;
		}
		return [];
	}
	const rows = await executor.all?.(query);
	return (rows ?? []) as T[];
};
