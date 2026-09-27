import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { count } from "drizzle-orm";
import * as authSchema from "../db/auth-schema";
import { user as userTable } from "../db/auth-schema";
import type { Database } from "../db/types";
import { ac, roles } from "./access";

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
		trustedOrigins,
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			admin({
				defaultRole: "user",
				adminRoles: ["admin"],
				ac,
				roles,
			}),
		],
		databaseHooks: {
			user: {
				create: {
					before: async (userData) => {
						const [{ value }] = await db
							.select({ value: count() })
							.from(userTable);
						return {
							data: {
								...userData,
								role: value === 0 ? "admin" : "user",
							},
						};
					},
				},
			},
		},
		advanced: {
			database: {
				joins: true,
			},
		},
	});
};

export type Auth = ReturnType<typeof createAuth>;

export type SessionData = NonNullable<
	Awaited<ReturnType<Auth["api"]["getSession"]>>
>;
