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
import { getSqlDialect, type SqlDialect } from "../db/dialect";
import type { Database } from "../db/types";
import type { AuthPolicyService } from "../services/auth-policy.service";
import { ac, roles } from "./access";
import {
	type EmailDeliveryConfig,
	sendOtpEmail,
	sendPasswordResetEmail,
	sendVerificationEmail,
} from "./email";
import {
	enabledSocialProviders,
	type SocialProvidersConfig,
} from "./social-providers";

/**
 * Password-reset delivery: Resend when configured, otherwise the explicit
 * local insecure-logging fallback. Production fails closed so reset tokens
 * never reach logs.
 */
export const createResetPasswordSender = ({
	email,
	allowInsecureLogging,
}: {
	email?: EmailDeliveryConfig;
	allowInsecureLogging: boolean;
}) => {
	return async ({
		user,
		url,
	}: {
		user: { email?: string | null };
		url: string;
	}) => {
		if (!user.email) {
			throw new ApiError(
				ApiErrorCode.SERVICE_UNAVAILABLE,
				"Password reset requires an email address.",
			);
		}
		await sendPasswordResetEmail(
			{ to: user.email, url },
			{ ...(email ?? {}), allowInsecureLogging },
		);
	};
};

const rethrowAsAuthError = (error: unknown): never => {
	if (error instanceof ApiError)
		throw new APIError("FORBIDDEN", {
			message: error.message,
			code: error.code,
		});
	throw error;
};

/** Organization mutations that must respect the billing freeze. */
const FROZEN_ORG_MUTATIONS = new Set([
	"/organization/update",
	"/organization/delete",
	"/organization/invite-member",
	"/organization/cancel-invitation",
	"/organization/accept-invitation",
	"/organization/reject-invitation",
	"/organization/remove-member",
	"/organization/update-member-role",
	"/organization/update-team",
	"/organization/create-team",
	"/organization/remove-team",
	"/organization/add-team-member",
	"/organization/remove-team-member",
	"/organization/create-role",
	"/organization/update-role",
	"/organization/delete-role",
	"/organization/leave",
]);

/** Admin mutations that must go through the shared self/admin guards. */
const ADMIN_MUTATIONS = {
	"/admin/set-role": "set-role",
	"/admin/ban-user": "ban-user",
	"/admin/remove-user": "remove-user",
	"/admin/set-user-password": "set-password",
	"/admin/impersonate-user": "impersonate",
	"/admin/revoke-user-sessions": "revoke-sessions",
	// `/admin/revoke-user-session` takes a session token, not a user id, so it
	// cannot be target-guarded without an extra session lookup.
} as const;

/** Endpoints that cannot work without a configured email transport. */
const EMAIL_DEPENDENT_PATHS = new Set([
	"/email-otp/send-verification-otp",
	"/email-otp/request-password-reset",
	"/forget-password/email-otp",
	"/email-otp/request-email-change",
	"/request-password-reset",
	"/send-verification-email",
]);

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
	allowInsecureLogging = false,
	onOrganizationCreated,
	onMemberAudit,
	dialect = getSqlDialect(),
}: {
	db: Database;
	secret: string;
	trustedOrigins: string[];
	policy: AuthPolicyService;
	baseURL?: string;
	social?: SocialProvidersConfig;
	email?: EmailDeliveryConfig;
	mcp?: McpAuthConfig;
	dialect?: SqlDialect;
	/** Local-only: log password-reset links and OTP codes to the Worker console. */
	allowInsecureLogging?: boolean;
	/**
	 * Seeds organization-owned defaults (workflow statuses). Runs inside the
	 * better-auth organization creation hook, after the org row exists.
	 */
	onOrganizationCreated?: (orgId: string) => Promise<unknown>;
	onMemberAudit?: (event: {
		orgId: string;
		actorId: string | null;
		action: "member.invited" | "member.removed" | "member.role_changed";
		targetType: string;
		targetId: string | null;
		before?: Record<string, unknown> | null;
		after?: Record<string, unknown> | null;
	}) => Promise<unknown>;
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
		// Emails are not verified without an email provider, so implicit
		// linking would attach a later OAuth login to an unverified account.
		oauth.account = {
			accountLinking: {
				enabled: true,
				disableImplicitLinking: true,
			},
		};
	}

	if (dialect === "mysql") {
		throw new Error(
			"MySQL dialect is not implemented. Use sqlite or postgres.",
		);
	}
	const emailDeliveryReady =
		Boolean(email?.resendApiKey?.trim() && email?.from?.trim()) ||
		allowInsecureLogging;
	const emailConfig = { ...(email ?? {}), allowInsecureLogging };

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: dialect === "postgres" ? "pg" : "sqlite",
			schema: authSchema,
		}),
		secret,
		trustedOrigins,
		...oauth,
		emailAndPassword: {
			enabled: true,
			sendResetPassword: createResetPasswordSender({
				email,
				allowInsecureLogging,
			}),
		},
		emailVerification: {
			sendVerificationEmail: async ({ user, url }) => {
				await sendVerificationEmail({ to: user.email, url }, emailConfig);
			},
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
					await sendOtpEmail({ to: recipient, otp, type }, emailConfig, {
						expiresInSeconds: 300,
					});
				},
			}),
			organization({
				// Invitation ids are opaque UUIDs delivered out of band (the web
				// invite link), so acceptance is possession-based. Email-based
				// enumeration stays blocked because better-auth requires a
				// verified email for `list-user-invitations`.
				requireEmailVerificationOnInvitation: false,
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
					afterCreateInvitation: async ({ invitation, inviter }) => {
						await onMemberAudit?.({
							orgId: invitation.organizationId,
							actorId: inviter.id,
							action: "member.invited",
							targetType: "invitation",
							targetId: invitation.id,
							after: { email: invitation.email, role: invitation.role },
						});
					},
					afterRemoveMember: async ({ member, user, organization }) => {
						await onMemberAudit?.({
							orgId: organization.id,
							actorId: null,
							action: "member.removed",
							targetType: "member",
							targetId: member.id,
							before: { userId: user.id, role: member.role },
						});
					},
					afterUpdateMemberRole: async ({
						member,
						previousRole,
						user,
						organization,
					}) => {
						await onMemberAudit?.({
							orgId: organization.id,
							actorId: null,
							action: "member.role_changed",
							targetType: "member",
							targetId: member.id,
							before: { userId: user.id, role: previousRole },
							after: { userId: user.id, role: member.role },
						});
					},
				},
			}),
		],
		databaseHooks: {
			user: {
				create: {
					// Promoting in a single conditional UPDATE keeps concurrent
					// first registrations from producing more than one admin.
					after: async (created) => {
						await policy.promoteFirstAdmin(created.id);
					},
				},
			},
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (EMAIL_DEPENDENT_PATHS.has(ctx.path) && !emailDeliveryReady) {
					throw new APIError("SERVICE_UNAVAILABLE", {
						message: "Email delivery is not configured.",
					});
				}

				const adminAction =
					ADMIN_MUTATIONS[ctx.path as keyof typeof ADMIN_MUTATIONS];
				if (adminAction || ctx.path === "/admin/update-user") {
					const session = await getSessionFromCtx(ctx);
					const body = ctx.body as
						| {
								userId?: unknown;
								data?: { role?: unknown; banned?: unknown };
						  }
						| undefined;
					if (session && typeof body?.userId === "string") {
						try {
							if (ctx.path === "/admin/update-user") {
								if (body.data?.role !== undefined) {
									await policy.assertAdminUserMutation(
										session.user.id,
										body.userId,
										"set-role",
									);
								}
								if (body.data?.banned === true) {
									await policy.assertAdminUserMutation(
										session.user.id,
										body.userId,
										"ban-user",
									);
								}
							} else if (adminAction) {
								await policy.assertAdminUserMutation(
									session.user.id,
									body.userId,
									adminAction,
								);
							}
						} catch (error) {
							rethrowAsAuthError(error);
						}
					}
				}

				if (FROZEN_ORG_MUTATIONS.has(ctx.path)) {
					const session = await getSessionFromCtx(ctx).catch(() => null);
					if (!session) return { context: ctx };
					const body =
						typeof ctx.body === "object" && ctx.body !== null
							? (ctx.body as {
									organizationId?: string;
									invitationId?: string;
									data?: { organizationId?: string };
								})
							: {};
					try {
						if (
							ctx.path === "/organization/accept-invitation" ||
							ctx.path === "/organization/reject-invitation" ||
							ctx.path === "/organization/cancel-invitation"
						) {
							// better-auth authorizes these by the invitation's own
							// organization, not by the client-supplied org id.
							await policy.assertInvitationNotFrozen(body.invitationId);
						} else {
							// update-team reads the target org from body.data.
							const orgId =
								(ctx.path === "/organization/update-team"
									? body.data?.organizationId
									: undefined) ??
								body.organizationId ??
								session.session.activeOrganizationId;
							if (orgId) await policy.assertOrgNotFrozen(orgId);
						}
					} catch (error) {
						rethrowAsAuthError(error);
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
						// The machine code rides along so the web can translate the
						// quota error instead of pattern-matching the message.
						throw new APIError("FORBIDDEN", {
							message: error.message,
							code: error.code,
						});
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
