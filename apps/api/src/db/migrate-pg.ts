import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
config({ path: resolve(apiRoot, ".env") });

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
	throw new Error("DATABASE_URL is required to migrate PostgreSQL");
}

const sql = postgres(databaseUrl, { max: 1 });
await migrate(drizzle({ client: sql }), {
	migrationsFolder: resolve(apiRoot, "drizzle-pg"),
});
const trgmScript = resolve(apiRoot, "drizzle-pg/fts/search_trgm.sql");
if (existsSync(trgmScript)) {
	await sql.unsafe(readFileSync(trgmScript, "utf8"));
	await sql.end();
	console.log("[db] migrated PostgreSQL and applied search indexes");
} else {
	await sql.end();
	console.log("[db] migrated PostgreSQL (search indexes disabled)");
}
