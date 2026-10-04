import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import { betterAuth } from "better-auth";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import * as authSchema from "../db/auth-schema";
import type { Database } from "../db/types";
import type { AuthPolicyService } from "../services/auth-policy.service";
import { ac, roles } from "./access";

/**
 * Password-reset delivery for this template: no email provider is configured,
 * so the reset link (which points at the API and redirects to the web reset
 * page) is written to the Worker console instead. A real deployment should
 * send `url` to `user.email` here and remove this development fallback.
 */
export const sendResetPasswordToConsole = async ({
	user,
	url,
}: {
	user: { email?: string | null };
	url: string;
}) => {
	console.log(
		`[auth] Password reset link for ${user.email ?? "unknown"}: ${url}`,
	);
	console.log(
		"[auth] No email provider is configured - deliver this URL to the user by email in production.",
	);
};

export const createAuth = ({
	db,
	secret,
	trustedOrigins,
	policy,
}: {
	db: Database;
	secret: string;
	trustedOrigins: string[];
	policy: AuthPolicyService;
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
			sendResetPassword: sendResetPasswordToConsole,
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
						return {
							data: {
								...userData,
								role: await policy.initialUserRole(),
								// This template has no email provider, so addresses are
								// never verified. better-auth gates client-side
								// `organization.listUserInvitations()` on a verified
								// session email, which would otherwise stay unusable.
								emailVerified: true,
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
					ctx.path !== "/organization/invite-member" &&
					ctx.path !== "/organization/accept-invitation"
				) {
					return { context: ctx };
				}
				const session = await getSessionFromCtx(ctx).catch(() => null);
				if (!session) {
					return { context: ctx };
				}
				const body =
					typeof ctx.body === "object" && ctx.body !== null
						? (ctx.body as { organizationId?: string; invitationId?: string })
						: {};
				try {
					if (ctx.path === "/organization/create") {
						await policy.assertCanCreateOrganization(session.user.id);
					} else if (ctx.path === "/organization/accept-invitation") {
						await policy.assertCanAcceptInvitation(body.invitationId);
					} else {
						const orgId =
							body.organizationId ?? session.session.activeOrganizationId;
						if (orgId) await policy.assertCanInviteMember(orgId);
					}
				} catch (error) {
					if (
						error instanceof ApiError &&
						error.code === ApiErrorCode.PLAN_LIMIT_EXCEEDED
					) {
						throw new APIError("FORBIDDEN", { message: error.message });
					}
					throw error;
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
