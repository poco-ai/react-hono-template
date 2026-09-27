import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import * as authSchema from "../db/auth-schema";
import type { Database } from "../routes";

/**
 * Better Auth 工厂：依赖（db、secret、trustedOrigins）由组合根 index.ts 注入。
 * 本文件不 import cloudflare:workers，保持可独立实例化、可测试。
 */

export const createAuth = ({
	db,
	secret,
	trustedOrigins,
}: {
	db: Database;
	secret: string;
	trustedOrigins: string[];
}) => {
	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema: authSchema,
		}),
		secret,
		emailAndPassword: {
			enabled: true,
		},
		trustedOrigins,
		advanced: {
			database: {
				joins: true,
			},
		},
	});
};
