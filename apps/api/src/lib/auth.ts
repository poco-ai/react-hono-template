import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { mcp as mcpPlugin } from "@better-auth/mcp";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { admin, emailOTP, jwt, organization } from "better-auth/plugins";
import * as authSchema from "../db/auth-schema";
import type { Database } from "../db/types";
import type { AuthPolicyService } from "../services/auth-policy.service";
import { ac, roles } from "./access";
import { type EmailDeliveryConfig, sendOtpEmail } from "./email";
import {
	enabledSocialProviders,
	type SocialProvidersConfig,
} from "./social-providers";

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

export type McpAuthConfig = {
	enabled: boolean;
	/** Canonical MCP protected-resource URL used as the token audience. */
	resource: string;
	loginPage: string;
	consentPage: string;
	scopes: readonly string[];
	/**
	 * Enables RFC 7591 dynamic client registration, including unauthenticated
	 * registration. Intended for local/dev only: any party could register a
	 * client. Production should use CIMD or manually provisioned clients.
	 */
	dcrEnabled: boolean;
};

export const createAuth = ({
	db,
	secret,
	trustedOrigins,
	policy,
	baseURL,
	social,
	email,
	mcp,
	onOrganizationCreated,
}: {
	db: Database;
	secret: string;
	trustedOrigins: string[];
	policy: AuthPolicyService;
	baseURL?: string;
	social?: SocialProvidersConfig;
	email?: EmailDeliveryConfig;
	mcp?: McpAuthConfig;
	/**
	 * Seeds organization-owned defaults (workflow statuses). Runs inside the
	 * better-auth organization creation hook, after the org row exists.
	 */
	onOrganizationCreated?: (orgId: string) => Promise<unknown>;
}) => {
	const providers = enabledSocialProviders(social);
	const trimmedBaseURL = baseURL?.trim();
	const oauth: {
		baseURL?: string;
		socialProviders?: {
			github?: { clientId: string; clientSecret: string };
			google?: { clientId: string; clientSecret: string };
		};
		account?: {
			accountLinking: {
				enabled: boolean;
				disableImplicitLinking: boolean;
			};
		};
	} = {};
	if (trimmedBaseURL) oauth.baseURL = trimmedBaseURL;
	if (providers.length > 0) {
		const github = social?.github;
		const google = social?.google;
		oauth.socialProviders = {
			...(providers.includes("github") && github
				? {
						github: {
							clientId: github.clientId,
							clientSecret: github.clientSecret,
						},
					}
				: {}),
			...(providers.includes("google") && google
				? {
						google: {
							clientId: google.clientId,
							clientSecret: google.clientSecret,
						},
					}
				: {}),
		};
		// Password signups are marked verified without an email provider, so
		// implicit linking would attach a later OAuth login to that account.
		oauth.account = {
			accountLinking: {
				enabled: true,
				disableImplicitLinking: true,
			},
		};
	}

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema: authSchema,
		}),
		secret,
		trustedOrigins,
		...oauth,
		emailAndPassword: {
			enabled: true,
			sendResetPassword: sendResetPasswordToConsole,
		},
		plugins: [
			// jwt() backs OAuth access tokens / the JWKS used by MCP clients.
			jwt(),
			...(mcp?.enabled
				? [
						mcpPlugin({
							resource: mcp.resource,
							loginPage: mcp.loginPage,
							consentPage: mcp.consentPage,
							scopes: [...mcp.scopes],
							...(mcp.dcrEnabled
								? {
										allowDynamicClientRegistration: true,
										allowUnauthenticatedClientRegistration: true,
									}
								: {}),
							// The oauth-provider return type is structurally a plugin but
							// its generic signature prevents better-auth's plugin-field
							// inference (admin role, etc.) from seeing the other plugins.
						}) as BetterAuthPlugin,
					]
				: []),
			admin({
				defaultRole: "user",
				adminRoles: ["admin"],
				ac,
				roles,
			}),
			emailOTP({
				otpLength: 6,
				expiresIn: 300,
				// Existing accounts only: unknown addresses get a silent success
				// without an email, so this route cannot be used to enumerate
				// users or create accounts without a name.
				disableSignUp: true,
				sendVerificationOTP: async ({ email: recipient, otp, type }) => {
					await sendOtpEmail({ to: recipient, otp, type }, email ?? {}, {
						expiresInSeconds: 300,
					});
				},
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
				organizationHooks: {
					afterCreateOrganization: async ({ organization: created }) => {
						await onOrganizationCreated?.(created.id);
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
				if (ctx.path === "/admin/set-role" || ctx.path === "/admin/ban-user") {
					const session = await getSessionFromCtx(ctx);
					const body = ctx.body as { userId?: unknown } | undefined;
					if (session && typeof body?.userId === "string") {
						try {
							await policy.assertAdminUserMutation(
								session.user.id,
								body.userId,
								ctx.path === "/admin/set-role" ? "set-role" : "ban-user",
							);
						} catch (error) {
							if (error instanceof ApiError)
								throw new APIError("FORBIDDEN", { message: error.message });
							throw error;
						}
					}
				}

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
