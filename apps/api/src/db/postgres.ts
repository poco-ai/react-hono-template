import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { authRelations } from "./auth-schema";
import type { Database } from "./types";

export const openPostgresDatabase = (databaseUrl: string) => {
	const client = postgres(databaseUrl, { max: 10 });
	const db = drizzle({
		client,
		relations: authRelations,
	}) as unknown as Database;
	return {
		db,
		close: () => client.end({ timeout: 5 }),
	};
};
