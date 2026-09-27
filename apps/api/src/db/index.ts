import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { authRelations } from "./auth-schema";

export const db = drizzle(env.DB, {
	relations: authRelations,
});
