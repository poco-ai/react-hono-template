import { type SQL, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

type SearchExpression = AnySQLiteColumn | SQL;

/**
 * Case-insensitive substring match shared by issue lists, global search and
 * structured filters. `instr` avoids D1's 50-byte LIKE-pattern limit (long CJK
 * terms) and needs no escaping, so `%` and `_` match literally.
 */
export const instrMatch = (
	term: string,
	...expressions: SearchExpression[]
): SQL => {
	const conditions = expressions.map(
		(expression) => sql`instr(lower(${expression}), lower(${term})) > 0`,
	);
	return conditions.length === 1
		? conditions[0]
		: sql`(${sql.join(conditions, sql` or `)})`;
};
