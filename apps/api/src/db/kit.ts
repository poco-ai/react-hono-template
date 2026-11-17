import { type SQL, sql } from "drizzle-orm";
import {
	boolean,
	customType,
	index as pgIndex,
	integer as pgInteger,
	primaryKey as pgPrimaryKey,
	pgTable,
	text as pgText,
	uniqueIndex as pgUniqueIndex,
} from "drizzle-orm/pg-core";
import {
	index as sqliteIndex,
	integer as sqliteInteger,
	primaryKey as sqlitePrimaryKey,
	sqliteTable,
	text as sqliteText,
	uniqueIndex as sqliteUniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { SchemaDialect } from "./dialect";
import { POSTGRES_NOW, SQLITE_NOW } from "./sql-profile";

/**
 * Millisecond timestamps stored as bigint. Drizzle's query builder still sees
 * `Date` values because the sqlite column cast preserves that TypeScript type.
 */
const millisecond = customType<{ data: Date; driverData: number | string }>({
	dataType() {
		return "bigint";
	},
	toDriver(value: Date | number) {
		return value instanceof Date ? value.getTime() : Number(value);
	},
	fromDriver(value: number | string) {
		return new Date(Number(value));
	},
});

/** JSON stored as text, matching the SQLite `text(..., { mode: "json" })` columns. */
const jsonText = customType<{ data: unknown; driverData: string }>({
	dataType() {
		return "text";
	},
	toDriver(value: unknown) {
		return JSON.stringify(value);
	},
	fromDriver(value: unknown) {
		if (typeof value !== "string") return value;
		return JSON.parse(value);
	},
});

export type SchemaKit = {
	sqliteTable: typeof sqliteTable;
	text: typeof sqliteText;
	integer: typeof sqliteInteger;
	index: typeof sqliteIndex;
	uniqueIndex: typeof sqliteUniqueIndex;
	primaryKey: typeof sqlitePrimaryKey;
	timestampDefault: SQL;
	trueLiteral: SQL;
};

/**
 * Column builders for one dialect, typed as the SQLite builders so the shared
 * table factory typechecks once. PostgreSQL objects are real `pg-core` columns
 * at runtime; the casts are compile-time only.
 */
export const createSchemaKit = (dialect: SchemaDialect): SchemaKit => {
	if (dialect === "sqlite") {
		return {
			sqliteTable,
			text: sqliteText,
			integer: sqliteInteger,
			index: sqliteIndex,
			uniqueIndex: sqliteUniqueIndex,
			primaryKey: sqlitePrimaryKey,
			timestampDefault: SQLITE_NOW,
			trueLiteral: sql`1`,
		};
	}

	const integer = ((
		name: string,
		config?: { mode?: "number" | "boolean" | "timestamp" | "timestamp_ms" },
	) => {
		if (config?.mode === "boolean") return boolean(name);
		if (config?.mode === "timestamp" || config?.mode === "timestamp_ms") {
			return millisecond(name);
		}
		return pgInteger(name);
	}) as unknown as typeof sqliteInteger;

	const text = ((
		name: string,
		config?: { mode?: "json" | "text"; enum?: readonly string[] },
	) => {
		if (config?.mode === "json") return jsonText(name);
		if (config?.enum) {
			return pgText(name, { enum: config.enum as [string, ...string[]] });
		}
		return pgText(name);
	}) as unknown as typeof sqliteText;

	return {
		sqliteTable: pgTable as unknown as typeof sqliteTable,
		text,
		integer,
		index: pgIndex as unknown as typeof sqliteIndex,
		uniqueIndex: pgUniqueIndex as unknown as typeof sqliteUniqueIndex,
		primaryKey: pgPrimaryKey as unknown as typeof sqlitePrimaryKey,
		timestampDefault: POSTGRES_NOW,
		trueLiteral: sql`true`,
	};
};
