import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { PLANS } from "@workspace/shared";
import { betterAuth } from "better-auth";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { count } from "drizzle-orm";
import { createMemberDao } from "../dao/member.dao";
import { createSubscriptionDao } from "../dao/subscription.dao";
import * as authSchema from "../db/auth-schema";
import { user as userTable } from "../db/auth-schema";
import type { Database } from "../db/types";
import { ac, roles } from "./access";
import { createPlanService } from "./plan";

export const createAuth = ({
	db,
	secret,
	trustedOrigins,
}: {
	db: Database;
	secret: string;
	trustedOrigins: string[];
}) => {
	const memberDao = createMemberDao(db);
	const planService = createPlanService(createSubscriptionDao(db));

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
			organization({
				schema: {
					organization: {
						additionalFields: {
							frozen: {
								type: "boolean",
								fieldName: "frozen",
								required: true,
								defaultValue: false,
								input: false,
							},
						},
					},
				},
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
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (
					ctx.path !== "/organization/create" &&
					ctx.path !== "/organization/invite-member"
				) {
					return { context: ctx };
				}
				const session = await getSessionFromCtx(ctx).catch(() => null);
				if (!session) {
					return { context: ctx };
				}
				if (ctx.path === "/organization/create") {
					const orgPlans = await memberDao.listOrgPlansByUser(session.user.id);
					const plan = orgPlans.includes("pro") ? "pro" : "free";
					if (orgPlans.length >= PLANS[plan].orgs) {
						throw new APIError("FORBIDDEN", {
							message: `Plan limit reached: the ${plan} plan allows belonging to ${PLANS[plan].orgs} organization(s). Upgrade to create more organizations.`,
						});
					}
					return { context: ctx };
				}
				const body =
					typeof ctx.body === "object" && ctx.body !== null
						? (ctx.body as { organizationId?: string })
						: {};
				const orgId =
					body.organizationId ?? session.session.activeOrganizationId;
				if (!orgId) {
					return { context: ctx };
				}
				const plan = await planService.getPlanForOrg(orgId);
				const memberCount = await memberDao.countByOrg(orgId);
				if (memberCount >= PLANS[plan].members) {
					throw new APIError("FORBIDDEN", {
						message: `Plan limit reached: the ${plan} plan allows up to ${PLANS[plan].members} members. Upgrade to invite more members.`,
					});
				}
				return { context: ctx };
			}),
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
