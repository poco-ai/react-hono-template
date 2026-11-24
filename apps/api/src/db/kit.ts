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
	type AnySQLiteColumn,
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
	/**
	 * Deferred foreign-key target for a table owned by another schema slice.
	 * Every table built through the kit's `sqliteTable`/`pgTable` is registered
	 * under its SQL name, so a slice (or `core`) can reference a column without
	 * importing the other slice's module — the reference resolves lazily, when
	 * Drizzle introspects the foreign keys, exactly like a self-`references(() => x.id)`.
	 *
	 * Constraint: only tables created through this kit are registered. A slice
	 * that imports `sqliteTable` directly would be invisible to `ref`, so every
	 * `features/<id>/schema.ts` must build its tables from the kit. The return
	 * type is `AnySQLiteColumn` for both dialects (the shared schema is typed
	 * against sqlite; PostgreSQL columns are real `pg-core` objects at runtime,
	 * the cast is compile-time only).
	 */
	ref: (table: string, column: string) => () => AnySQLiteColumn;
};

/**
 * Column builders for one dialect, typed as the SQLite builders so the shared
 * table factory typechecks once. PostgreSQL objects are real `pg-core` columns
 * at runtime; the casts are compile-time only.
 */
export const createSchemaKit = (dialect: SchemaDialect): SchemaKit => {
	const registry = new Map<string, Record<string, AnySQLiteColumn>>();

	const ref = (table: string, column: string) => {
		return (): AnySQLiteColumn => {
			const target = registry.get(table);
			const found = target?.[column];
			if (!found) {
				throw new Error(
					`schema kit: foreign key target ${table}.${column} is not defined`,
				);
			}
			return found;
		};
	};

	const track = <T>(name: string, table: T): T => {
		registry.set(name, table as unknown as Record<string, AnySQLiteColumn>);
		return table;
	};

	/** Registers every table the kit builds so `ref` can resolve it by name. */
	const withRegistry = (
		create: (name: string, columns: never, extra?: never) => unknown,
	) =>
		((name: string, columns: never, extra?: never) => {
			const table =
				extra === undefined
					? create(name, columns)
					: create(name, columns, extra);
			return track(name, table);
		}) as unknown as typeof sqliteTable;

	if (dialect === "sqlite") {
		return {
			sqliteTable: withRegistry(sqliteTable),
			text: sqliteText,
			integer: sqliteInteger,
			index: sqliteIndex,
			uniqueIndex: sqliteUniqueIndex,
			primaryKey: sqlitePrimaryKey,
			timestampDefault: SQLITE_NOW,
			trueLiteral: sql`1`,
			ref,
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
		sqliteTable: withRegistry(pgTable),
		text,
		integer,
		index: pgIndex as unknown as typeof sqliteIndex,
		uniqueIndex: pgUniqueIndex as unknown as typeof sqliteUniqueIndex,
		primaryKey: pgPrimaryKey as unknown as typeof sqlitePrimaryKey,
		timestampDefault: POSTGRES_NOW,
		trueLiteral: sql`true`,
		ref,
	};
};
