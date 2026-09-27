import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { authRelations } from "./auth-schema";

export type Database = DrizzleD1Database<typeof authRelations>;
