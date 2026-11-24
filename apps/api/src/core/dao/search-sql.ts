import { type SQL, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sqlProfile } from "../../db/sql-profile";

type SearchExpression = AnySQLiteColumn | SQL;

const joinMatch = (
	match: (expression: SearchExpression, term: string) => SQL,
	term: string,
	expressions: SearchExpression[],
): SQL => {
	const conditions = expressions.map((expression) => match(expression, term));
	return conditions.length === 1
		? conditions[0]
		: sql`(${sql.join(conditions, sql` or `)})`;
};

/**
 * Case-insensitive substring match shared by issue lists, global search and
 * structured filters. SQLite uses `instr` so D1's 50-byte LIKE limit never
 * applies and `%` / `_` match literally. PostgreSQL uses `strpos`.
 */
export const instrMatch = (
	term: string,
	...expressions: SearchExpression[]
): SQL => joinMatch(sqlProfile().includes, term, expressions);

/** Long-token match. PostgreSQL uses ILIKE so a pg_trgm index can apply. */
export const trigramMatch = (
	term: string,
	...expressions: SearchExpression[]
): SQL => joinMatch(sqlProfile().trigram, term, expressions);
