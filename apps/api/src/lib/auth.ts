import { env } from "cloudflare:workers";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { db } from "../db";
import * as authSchema from "../db/auth-schema";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "sqlite",
		schema: authSchema,
	}),
	secret: env.BETTER_AUTH_SECRET,
	emailAndPassword: {
		enabled: true,
	},
	trustedOrigins: [
		"http://localhost:5173",
		"https://react-hono-web.chenqiyuan1012.workers.dev",
	],
	advanced: {
		database: {
			joins: true,
		},
	},
});
