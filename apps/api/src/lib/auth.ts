import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import * as authSchema from "../db/auth-schema";
import type { Database } from "../routes";

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
