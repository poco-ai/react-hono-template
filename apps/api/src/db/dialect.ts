export type SqlDialect = "sqlite" | "postgres" | "mysql";

/** Dialects that have a schema factory. MySQL is reserved and rejected. */
export type SchemaDialect = Exclude<SqlDialect, "mysql">;

const MYSQL_ERROR =
	"MySQL dialect is not implemented. Use sqlite (Cloudflare) or postgres (Bun server).";

let current: SchemaDialect = "sqlite";

export const getSqlDialect = (): SchemaDialect => current;

/**
 * Selects the schema and SQL helpers for this process.
 * MySQL is a named slot only: calling this throws before any driver is loaded.
 */
export const setSqlDialect = (dialect: SqlDialect): void => {
	if (dialect === "mysql") {
		throw new Error(MYSQL_ERROR);
	}
	current = dialect;
};

/** Bun server entry. SQLite stays on the Cloudflare Worker entry. */
export const resolveServerDialect = (
	value: string | undefined,
): SchemaDialect => {
	const raw = value?.trim() || "postgres";
	if (raw === "mysql") {
		throw new Error(MYSQL_ERROR);
	}
	if (raw === "sqlite") {
		throw new Error(
			"The Bun server runs on PostgreSQL. SQLite remains the Cloudflare runtime.",
		);
	}
	if (raw !== "postgres") {
		throw new Error(`Unknown SQL_DIALECT "${raw}". Expected postgres.`);
	}
	return "postgres";
};
