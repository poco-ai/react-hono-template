import { sql } from "drizzle-orm";
import type { SchemaKit } from "../../db/kit";

/** JWT / OAuth provider tables for the better-auth jwt + mcp plugins. */
export const defineMcpTables = (kit: SchemaKit) => {
	const { sqliteTable, text, integer, index, uniqueIndex, timestampDefault } =
		kit;

	// ---------------------------------------------------------------------------
	// JWT / OAuth provider tables (better-auth jwt + mcp plugins)
	//
	// Field names come from `jwt().schema` and `mcp({...}).schema`; see the
	// better-auth docs. `string[]` / `json` fields use Drizzle's JSON text mode so
	// the drizzle adapter serializes them for SQLite.
	// ---------------------------------------------------------------------------

	const jwks = sqliteTable("jwks", {
		id: text("id").primaryKey(),
		publicKey: text("public_key").notNull(),
		privateKey: text("private_key").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(timestampDefault)
			.notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
		alg: text("alg"),
		crv: text("crv"),
	});

	const oauthClient = sqliteTable(
		"oauth_client",
		{
			id: text("id").primaryKey(),
			clientId: text("client_id").notNull().unique(),
			clientSecret: text("client_secret"),
			clientDiscoveryId: text("client_discovery_id"),
			disabled: integer("disabled", { mode: "boolean" })
				.default(false)
				.notNull(),
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
			userId: text("user_id").references(kit.ref("user", "id"), {
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

	const oauthResource = sqliteTable("oauth_resource", {
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
		dpopBoundAccessTokensRequired: integer(
			"dpop_bound_access_tokens_required",
			{
				mode: "boolean",
			},
		)
			.default(false)
			.notNull(),
		disabled: integer("disabled", { mode: "boolean" }).default(false).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
		policyVersion: integer("policy_version").default(1).notNull(),
		metadata: text("metadata", { mode: "json" }).$type<
			Record<string, unknown>
		>(),
	});

	const oauthClientResource = sqliteTable(
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

	const oauthRefreshToken = sqliteTable(
		"oauth_refresh_token",
		{
			id: text("id").primaryKey(),
			token: text("token").notNull().unique(),
			clientId: text("client_id")
				.notNull()
				.references(() => oauthClient.clientId),
			sessionId: text("session_id").references(kit.ref("session", "id"), {
				onDelete: "set null",
			}),
			userId: text("user_id").notNull().references(kit.ref("user", "id")),
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

	const oauthAccessToken = sqliteTable(
		"oauth_access_token",
		{
			id: text("id").primaryKey(),
			token: text("token").unique(),
			clientId: text("client_id")
				.notNull()
				.references(() => oauthClient.clientId),
			sessionId: text("session_id").references(kit.ref("session", "id"), {
				onDelete: "set null",
			}),
			userId: text("user_id").references(kit.ref("user", "id")),
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

	const oauthConsent = sqliteTable(
		"oauth_consent",
		{
			id: text("id").primaryKey(),
			clientId: text("client_id")
				.notNull()
				.references(() => oauthClient.clientId),
			userId: text("user_id").references(kit.ref("user", "id")),
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

	const oauthClientAssertion = sqliteTable("oauth_client_assertion", {
		id: text("id").primaryKey(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
	});

	return {
		jwks,
		oauthClient,
		oauthResource,
		oauthClientResource,
		oauthRefreshToken,
		oauthAccessToken,
		oauthConsent,
		oauthClientAssertion,
	};
};
