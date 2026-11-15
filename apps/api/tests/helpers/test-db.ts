import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { Database as AppDatabase } from "../../src/db/types";

/**
 * In-memory SQLite built from the checked-in drizzle migrations.
 *
 * Using the real migrations keeps the tests on the production schema (NOT NULL
 * columns, unique indexes, FTS triggers) instead of hand-maintained DDL that
 * drifts. The folder is resolved from this module's URL so `bun test` works
 * from the repository root as well as from `apps/api`.
 */
const MIGRATIONS_FOLDER = resolve(
	fileURLToPath(new URL(".", import.meta.url).href),
	"../../drizzle",
);

export type TestDb = {
	sqlite: Database;
	db: AppDatabase;
	/** Statements of every batch call, in call order (fan-out assertions). */
	batches: unknown[][];
};

export const createTestDb = (): TestDb => {
	const sqlite = new Database(":memory:");
	// D1 enables foreign-key enforcement; tests keep it off so fixtures can be
	// inserted in any order. NOT NULL and UNIQUE constraints still apply, which
	// is what the schema-drift checks rely on.
	sqlite.exec("PRAGMA foreign_keys = OFF");

	const client = drizzle({ client: sqlite });
	// The migrator applies each `drizzle/*/migration.sql` once and records it in
	// `__drizzle_migrations`, so a fresh database never re-runs a migration.
	migrate(client, { migrationsFolder: MIGRATIONS_FOLDER });

	const batches: unknown[][] = [];
	// Drizzle's bun-sqlite driver (1.0 RC) has no batch(); DAO contracts are
	// written for D1 batches, so run the statements sequentially. A local
	// transaction cannot model D1's cross-request serialization (two concurrent
	// toggles), so tests assert the resulting invariants instead. Statements are
	// recorded for fan-out chunking asserts.
	const db = Object.assign(client, {
		batch: async (statements: unknown[]) => {
			const results: unknown[] = [];
			for (const statement of statements) {
				results.push(await statement);
			}
			batches.push(statements);
			return results;
		},
	}) as unknown as AppDatabase;

	return { sqlite, db, batches };
};
