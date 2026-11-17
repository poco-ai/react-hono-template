import { type SQL, sql } from "drizzle-orm";
import { getSqlDialect, type SchemaDialect } from "./dialect";

type SqlExpr = SQL | { _: unknown };

/**
 * Column defaults and raw inserts share these fragments. One process hosts one
 * dialect; callers read the profile when they build a statement, after
 * `setSqlDialect`.
 */
export const SQLITE_NOW = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
export const POSTGRES_NOW = sql`(cast(extract(epoch from now()) * 1000 as bigint))`;

const SQLITE_ID = sql`lower(hex(randomblob(16)))`;
const POSTGRES_ID = sql`replace(gen_random_uuid()::text, '-', '')`;

const escapeLike = (value: string) =>
	value.replace(/[!%_]/g, (char) => `!${char}`);

const includesInstr = (expr: SqlExpr, token: string) =>
	sql`instr(lower(${expr}), lower(${token})) > 0`;

const includesStrpos = (expr: SqlExpr, token: string) =>
	sql`strpos(lower(${expr}), lower(${token})) > 0`;

const includesTrigram = (expr: SqlExpr, token: string) => {
	const pattern = `%${escapeLike(token)}%`;
	return sql`${expr} ilike ${pattern} escape '!'`;
};

const archivedIs = (value: "0" | "false") => (alias: string) => {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
		throw new Error(`Invalid SQL alias "${alias}"`);
	}
	return sql.raw(`${alias}.archived = ${value}`);
};

export type SqlProfile = {
	dialect: SchemaDialect;
	now: SQL;
	randomId: SQL;
	includes: (expr: SqlExpr, token: string) => SQL;
	/** Long-token match. PostgreSQL uses ILIKE so a pg_trgm index can apply. */
	trigram: (expr: SqlExpr, token: string) => SQL;
	archivedIsFalse: (alias: string) => SQL;
};

const sqliteProfile: SqlProfile = {
	dialect: "sqlite",
	now: SQLITE_NOW,
	randomId: SQLITE_ID,
	includes: includesInstr,
	trigram: includesInstr,
	archivedIsFalse: archivedIs("0"),
};

const postgresProfile: SqlProfile = {
	dialect: "postgres",
	now: POSTGRES_NOW,
	randomId: POSTGRES_ID,
	includes: includesStrpos,
	trigram: includesTrigram,
	archivedIsFalse: archivedIs("false"),
};

export const sqlProfile = (): SqlProfile =>
	getSqlDialect() === "postgres" ? postgresProfile : sqliteProfile;
