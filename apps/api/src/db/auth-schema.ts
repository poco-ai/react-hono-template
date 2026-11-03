import { defineRelationsPart, sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" })
		.default(false)
		.notNull(),
	image: text("image"),
	role: text("role").notNull().default("user"),
	banned: integer("banned", { mode: "boolean" }),
	banReason: text("ban_reason"),
	banExpires: integer("ban_expires", { mode: "timestamp_ms" }),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const session = sqliteTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		token: text("token").notNull().unique(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		impersonatedBy: text("impersonated_by"),
		activeOrganizationId: text("active_organization_id"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: integer("access_token_expires_at", {
			mode: "timestamp_ms",
		}),
		refreshTokenExpiresAt: integer("refresh_token_expires_at", {
			mode: "timestamp_ms",
		}),
		scope: text("scope"),
		password: text("password"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = sqliteTable("organization", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	logo: text("logo"),
	metadata: text("metadata"),
	frozen: integer("frozen", { mode: "boolean" }).notNull().default(false),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const member = sqliteTable(
	"member",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").notNull().default("member"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("member_organizationId_idx").on(table.organizationId),
		index("member_userId_idx").on(table.userId),
	],
);

export const invitation = sqliteTable(
	"invitation",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role").notNull(),
		status: text("status").notNull().default("pending"),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
		inviterId: text("inviter_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("invitation_organizationId_idx").on(table.organizationId),
		index("invitation_email_idx").on(table.email),
	],
);

// ---------------------------------------------------------------------------
// JWT / OAuth provider tables (better-auth jwt + mcp plugins)
//
// Field names come from `jwt().schema` and `mcp({...}).schema`; see the
// better-auth docs. `string[]` / `json` fields use Drizzle's JSON text mode so
// the drizzle adapter serializes them for SQLite.
// ---------------------------------------------------------------------------

export const jwks = sqliteTable("jwks", {
	id: text("id").primaryKey(),
	publicKey: text("public_key").notNull(),
	privateKey: text("private_key").notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
	alg: text("alg"),
	crv: text("crv"),
});

export const oauthClient = sqliteTable(
	"oauth_client",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id").notNull().unique(),
		clientSecret: text("client_secret"),
		clientDiscoveryId: text("client_discovery_id"),
		disabled: integer("disabled", { mode: "boolean" }).default(false).notNull(),
		skipConsent: integer("skip_consent", { mode: "boolean" }),
		enableEndSession: integer("enable_end_session", { mode: "boolean" }),
		subjectType: text("subject_type"),
		scopes: text("scopes", { mode: "json" }).$type<string[]>(),
		clientCredentialsScopes: text("client_credentials_scopes", {
			mode: "json",
		})
			.$type<string[]>()
			.default(sql`'[]'`)
			.notNull(),
		userId: text("user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		createdAt: integer("created_at", { mode: "timestamp_ms" }),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
		name: text("name"),
		uri: text("uri"),
		icon: text("icon"),
		contacts: text("contacts", { mode: "json" }).$type<string[]>(),
		tos: text("tos"),
		policy: text("policy"),
		softwareId: text("software_id"),
		softwareVersion: text("software_version"),
		softwareStatement: text("software_statement"),
		redirectUris: text("redirect_uris", { mode: "json" })
			.$type<string[]>()
			.notNull(),
		postLogoutRedirectUris: text("post_logout_redirect_uris", {
			mode: "json",
		}).$type<string[]>(),
		backchannelLogoutUri: text("backchannel_logout_uri"),
		backchannelLogoutSessionRequired: integer(
			"backchannel_logout_session_required",
			{ mode: "boolean" },
		),
		tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
		applicationType: text("application_type"),
		jwks: text("jwks"),
		jwksUri: text("jwks_uri"),
		grantTypes: text("grant_types", { mode: "json" }).$type<string[]>(),
		responseTypes: text("response_types", { mode: "json" }).$type<string[]>(),
		requirePKCE: integer("require_pkce", { mode: "boolean" }),
		dpopBoundAccessTokens: integer("dpop_bound_access_tokens", {
			mode: "boolean",
		})
			.default(false)
			.notNull(),
		referenceId: text("reference_id"),
		metadata: text("metadata", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
	},
	(table) => [index("oauthClient_userId_idx").on(table.userId)],
);

export const oauthResource = sqliteTable("oauth_resource", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull().unique(),
	name: text("name").notNull(),
	accessTokenTtl: integer("access_token_ttl"),
	refreshTokenTtl: integer("refresh_token_ttl"),
	signingAlgorithm: text("signing_algorithm"),
	signingKeyId: text("signing_key_id"),
	allowedScopes: text("allowed_scopes", { mode: "json" }).$type<string[]>(),
	customClaims: text("custom_claims", { mode: "json" }).$type<
		Record<string, unknown>
	>(),
	dpopBoundAccessTokensRequired: integer("dpop_bound_access_tokens_required", {
		mode: "boolean",
	})
		.default(false)
		.notNull(),
	disabled: integer("disabled", { mode: "boolean" }).default(false).notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
	policyVersion: integer("policy_version").default(1).notNull(),
	metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
});

export const oauthClientResource = sqliteTable(
	"oauth_client_resource",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		resourceId: text("resource_id")
			.notNull()
			.references(() => oauthResource.identifier, { onDelete: "cascade" }),
		metadata: text("metadata", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		uniqueIndex("oauthClientResource_clientId_resourceId_uq").on(
			table.clientId,
			table.resourceId,
		),
		index("oauthClientResource_clientId_idx").on(table.clientId),
		index("oauthClientResource_resourceId_idx").on(table.resourceId),
	],
);

export const oauthRefreshToken = sqliteTable(
	"oauth_refresh_token",
	{
		id: text("id").primaryKey(),
		token: text("token").notNull().unique(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId),
		sessionId: text("session_id").references(() => session.id, {
			onDelete: "set null",
		}),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		referenceId: text("reference_id"),
		authorizationCodeId: text("authorization_code_id"),
		resources: text("resources", { mode: "json" }).$type<string[]>(),
		requestedUserInfoClaims: text("requested_user_info_claims", {
			mode: "json",
		}).$type<string[]>(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" }),
		revoked: integer("revoked", { mode: "timestamp_ms" }),
		rotatedAt: integer("rotated_at", { mode: "timestamp_ms" }),
		rotationReplayResponse: text("rotation_replay_response"),
		rotationReplayExpiresAt: integer("rotation_replay_expires_at", {
			mode: "timestamp_ms",
		}),
		authTime: integer("auth_time", { mode: "timestamp_ms" }),
		confirmation: text("confirmation", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
		scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
	},
	(table) => [
		index("oauthRefreshToken_clientId_idx").on(table.clientId),
		index("oauthRefreshToken_sessionId_idx").on(table.sessionId),
		index("oauthRefreshToken_userId_idx").on(table.userId),
		index("oauthRefreshToken_authorizationCodeId_idx").on(
			table.authorizationCodeId,
		),
	],
);

export const oauthAccessToken = sqliteTable(
	"oauth_access_token",
	{
		id: text("id").primaryKey(),
		token: text("token").unique(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId),
		sessionId: text("session_id").references(() => session.id, {
			onDelete: "set null",
		}),
		userId: text("user_id").references(() => user.id),
		referenceId: text("reference_id"),
		authorizationCodeId: text("authorization_code_id"),
		resources: text("resources", { mode: "json" }).$type<string[]>(),
		requestedUserInfoClaims: text("requested_user_info_claims", {
			mode: "json",
		}).$type<string[]>(),
		refreshId: text("refresh_id").references(() => oauthRefreshToken.id),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" }),
		revoked: integer("revoked", { mode: "timestamp_ms" }),
		confirmation: text("confirmation", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
		scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
	},
	(table) => [
		index("oauthAccessToken_clientId_idx").on(table.clientId),
		index("oauthAccessToken_sessionId_idx").on(table.sessionId),
		index("oauthAccessToken_userId_idx").on(table.userId),
		index("oauthAccessToken_authorizationCodeId_idx").on(
			table.authorizationCodeId,
		),
		index("oauthAccessToken_refreshId_idx").on(table.refreshId),
	],
);

export const oauthConsent = sqliteTable(
	"oauth_consent",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId),
		userId: text("user_id").references(() => user.id),
		referenceId: text("reference_id"),
		resources: text("resources", { mode: "json" }).$type<string[]>(),
		requestedUserInfoClaims: text("requested_user_info_claims", {
			mode: "json",
		}).$type<string[]>(),
		scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		index("oauthConsent_clientId_idx").on(table.clientId),
		index("oauthConsent_userId_idx").on(table.userId),
	],
);

export const oauthClientAssertion = sqliteTable("oauth_client_assertion", {
	id: text("id").primaryKey(),
	expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const authRelations = defineRelationsPart(
	{ user, session, account, verification, organization, member, invitation },
	(r) => ({
		user: {
			sessions: r.many.session({
				from: r.user.id,
				to: r.session.userId,
			}),
			accounts: r.many.account({
				from: r.user.id,
				to: r.account.userId,
			}),
			members: r.many.member({
				from: r.user.id,
				to: r.member.userId,
			}),
		},
		session: {
			user: r.one.user({
				from: r.session.userId,
				to: r.user.id,
			}),
		},
		account: {
			user: r.one.user({
				from: r.account.userId,
				to: r.user.id,
			}),
		},
		organization: {
			members: r.many.member({
				from: r.organization.id,
				to: r.member.organizationId,
			}),
			invitations: r.many.invitation({
				from: r.organization.id,
				to: r.invitation.organizationId,
			}),
		},
		member: {
			organization: r.one.organization({
				from: r.member.organizationId,
				to: r.organization.id,
			}),
			user: r.one.user({
				from: r.member.userId,
				to: r.user.id,
			}),
		},
		invitation: {
			organization: r.one.organization({
				from: r.invitation.organizationId,
				to: r.organization.id,
			}),
		},
	}),
);
