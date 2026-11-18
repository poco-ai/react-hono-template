import type { IssueQuery } from "@workspace/shared";
import { defineRelationsPart, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { SchemaDialect } from "./dialect";
import { createSchemaKit } from "./kit";

/**
 * One table definition for SQLite and PostgreSQL. Callers that typecheck
 * against this module see the SQLite column types; `defineSchema("postgres")`
 * still builds real pg-core tables.
 */
export const defineSchema = (dialect: SchemaDialect) => {
	const {
		sqliteTable,
		text,
		integer,
		index,
		uniqueIndex,
		primaryKey,
		timestampDefault,
		trueLiteral,
	} = createSchemaKit(dialect);

	const user = sqliteTable("user", {
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
			.default(timestampDefault)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampDefault)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	});

	const session = sqliteTable(
		"session",
		{
			id: text("id").primaryKey(),
			expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
			token: text("token").notNull().unique(),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
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

	const account = sqliteTable(
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
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [index("account_userId_idx").on(table.userId)],
	);

	const verification = sqliteTable(
		"verification",
		{
			id: text("id").primaryKey(),
			identifier: text("identifier").notNull(),
			value: text("value").notNull(),
			expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [index("verification_identifier_idx").on(table.identifier)],
	);

	const organization = sqliteTable("organization", {
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		logo: text("logo"),
		metadata: text("metadata"),
		frozen: integer("frozen", { mode: "boolean" }).notNull().default(false),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(timestampDefault)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampDefault)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	});

	const member = sqliteTable(
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
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			index("member_organizationId_idx").on(table.organizationId),
			index("member_userId_idx").on(table.userId),
		],
	);

	const invitation = sqliteTable(
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
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
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

	const oauthAccessToken = sqliteTable(
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

	const oauthConsent = sqliteTable(
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

	const oauthClientAssertion = sqliteTable("oauth_client_assertion", {
		id: text("id").primaryKey(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
	});

	const authRelations = defineRelationsPart(
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

	const projects = sqliteTable(
		"projects",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			name: text("name").notNull(),
			key: text("key").notNull(),
			description: text("description"),
			color: text("color"),
			archived: integer("archived", { mode: "boolean" })
				.notNull()
				.default(false),
			nextNumber: integer("next_number").notNull().default(1),
			// Project health rollup: on_track | at_risk | off_track (null = unset).
			health: text("health"),
			targetDate: integer("target_date", { mode: "timestamp_ms" }),
			leadId: text("lead_id").references(() => user.id, {
				onDelete: "set null",
			}),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			uniqueIndex("projects_orgId_key_uq").on(table.orgId, table.key),
			index("projects_orgId_idx").on(table.orgId),
		],
	);

	/**
	 * Time-boxed planning periods per project (Linear-style cycles). `number` is
	 * per-project and never reused. The derived state (upcoming/current/past) is
	 * computed from the dates at read time and never stored.
	 */
	const cycles = sqliteTable(
		"cycles",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			projectId: text("project_id")
				.notNull()
				.references(() => projects.id, { onDelete: "cascade" }),
			name: text("name").notNull(),
			number: integer("number").notNull(),
			startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
			endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
			createdById: text("created_by_id").references(() => user.id, {
				onDelete: "set null",
			}),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			uniqueIndex("cycles_projectId_number_uq").on(
				table.projectId,
				table.number,
			),
			index("cycles_projectId_startsAt_idx").on(
				table.projectId,
				table.startsAt,
			),
		],
	);

	const issueStatuses = sqliteTable(
		"issue_statuses",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			name: text("name").notNull(),
			// backlog | unstarted | started | completed | canceled
			category: text("category").notNull(),
			color: text("color").notNull(),
			position: integer("position").notNull().default(0),
			isDefault: integer("is_default", { mode: "boolean" })
				.notNull()
				.default(false),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			uniqueIndex("issueStatuses_orgId_name_uq").on(table.orgId, table.name),
			// At most one default status per organization; writes clear the previous
			// default first so the partial index is never momentarily violated.
			uniqueIndex("issueStatuses_orgId_default_uq")
				.on(table.orgId)
				.where(sql`${table.isDefault} = ${trueLiteral}`),
			index("issueStatuses_orgId_idx").on(table.orgId),
		],
	);

	const issues = sqliteTable(
		"issues",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			projectId: text("project_id")
				.notNull()
				.references(() => projects.id, { onDelete: "cascade" }),
			number: integer("number").notNull(),
			title: text("title").notNull(),
			description: text("description"),
			// Self-reference for sub-issues. At most two levels are allowed; the
			// service enforces depth and project/org consistency.
			parentId: text("parent_id").references((): AnySQLiteColumn => issues.id, {
				onDelete: "set null",
			}),
			statusId: text("status_id")
				.notNull()
				.references(() => issueStatuses.id, { onDelete: "restrict" }),
			// Planning cycle; deleting a cycle detaches its issues (set null).
			cycleId: text("cycle_id").references(() => cycles.id, {
				onDelete: "set null",
			}),
			priority: integer("priority").notNull().default(0),
			assigneeId: text("assignee_id").references(() => user.id, {
				onDelete: "set null",
			}),
			createdById: text("created_by_id").references(() => user.id, {
				onDelete: "set null",
			}),
			dueDate: integer("due_date", { mode: "timestamp_ms" }),
			estimate: integer("estimate"),
			/** Soft delete (not restorable through the API). */
			deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
			/**
			 * Archival: hidden from lists, search, statistics and cycle/sub-issue
			 * progress, but the detail page stays reachable and `restore` clears it.
			 * Distinct from `deletedAt`, which stays a one-way soft delete.
			 */
			archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			uniqueIndex("issues_projectId_number_uq").on(
				table.projectId,
				table.number,
			),
			index("issues_orgId_idx").on(table.orgId),
			index("issues_orgId_statusId_idx").on(table.orgId, table.statusId),
			index("issues_orgId_assigneeId_idx").on(table.orgId, table.assigneeId),
			index("issues_orgId_parentId_idx").on(table.orgId, table.parentId),
			index("issues_orgId_cycleId_idx").on(table.orgId, table.cycleId),
			index("issues_orgId_archivedAt_idx").on(table.orgId, table.archivedAt),
		],
	);

	const labels = sqliteTable(
		"labels",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			name: text("name").notNull(),
			color: text("color").notNull().default("#94a3b8"),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			uniqueIndex("labels_orgId_name_uq").on(table.orgId, table.name),
		],
	);

	const issueLabels = sqliteTable(
		"issue_labels",
		{
			issueId: text("issue_id")
				.notNull()
				.references(() => issues.id, { onDelete: "cascade" }),
			labelId: text("label_id")
				.notNull()
				.references(() => labels.id, { onDelete: "cascade" }),
		},
		(table) => [
			primaryKey({ columns: [table.issueId, table.labelId] }),
			// Label filters resolve issue ids by label; the PK only covers issueId.
			index("issue_labels_labelId_idx").on(table.labelId),
		],
	);

	/**
	 * Issue relations in canonical storage form: `blocks` is directed (A blocks B)
	 * while `related` and `duplicates` are symmetric (pair ids sorted, one row per
	 * pair). The API/UI present blocks from the current issue's point of view
	 * (blocks / blockedBy) and show related/duplicates as symmetric groups.
	 */
	const issueRelations = sqliteTable(
		"issue_relations",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			issueId: text("issue_id")
				.notNull()
				.references(() => issues.id, { onDelete: "cascade" }),
			relatedIssueId: text("related_issue_id")
				.notNull()
				.references(() => issues.id, { onDelete: "cascade" }),
			// blocks | related | duplicates
			type: text("type").notNull(),
			createdById: text("created_by_id").references(() => user.id, {
				onDelete: "set null",
			}),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			uniqueIndex("issueRelations_issueId_relatedIssueId_type_uq").on(
				table.issueId,
				table.relatedIssueId,
				table.type,
			),
			index("issueRelations_orgId_idx").on(table.orgId),
			index("issueRelations_relatedIssueId_idx").on(table.relatedIssueId),
		],
	);

	/**
	 * Project status updates: short posts written by members to report progress
	 * and (optionally) the project health at that point in time.
	 */
	const projectUpdates = sqliteTable(
		"project_updates",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			projectId: text("project_id")
				.notNull()
				.references(() => projects.id, { onDelete: "cascade" }),
			authorId: text("author_id").references(() => user.id, {
				onDelete: "set null",
			}),
			body: text("body").notNull(),
			// on_track | at_risk | off_track (null = no health reported)
			health: text("health"),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			index("projectUpdates_projectId_createdAt_idx").on(
				table.projectId,
				sql`${table.createdAt} desc`,
			),
			index("projectUpdates_orgId_idx").on(table.orgId),
		],
	);

	const comments = sqliteTable(
		"comments",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			issueId: text("issue_id")
				.notNull()
				.references(() => issues.id, { onDelete: "cascade" }),
			authorId: text("author_id")
				.notNull()
				.references(() => user.id, { onDelete: "cascade" }),
			// Replies are one level deep only: the parent must be a top-level
			// comment (the service rejects replies to replies).
			parentId: text("parent_id").references(
				(): AnySQLiteColumn => comments.id,
				{
					onDelete: "cascade",
				},
			),
			body: text("body").notNull(),
			// Thread resolution (top-level comments only).
			resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
			resolvedById: text("resolved_by_id").references(() => user.id, {
				onDelete: "set null",
			}),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			index("comments_issueId_idx").on(table.issueId),
			index("comments_parentId_idx").on(table.parentId),
		],
	);

	const attachments = sqliteTable(
		"attachments",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			issueId: text("issue_id")
				.notNull()
				.references(() => issues.id, { onDelete: "cascade" }),
			uploaderId: text("uploader_id").references(() => user.id, {
				onDelete: "set null",
			}),
			commentId: text("comment_id").references(() => comments.id, {
				onDelete: "cascade",
			}),
			key: text("key").notNull(),
			filename: text("filename").notNull(),
			contentType: text("content_type").notNull(),
			size: integer("size").notNull(),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			uniqueIndex("attachments_key_uq").on(table.key),
			index("attachments_issueId_idx").on(table.issueId),
			index("attachments_orgId_createdAt_idx").on(table.orgId, table.createdAt),
			index("attachments_commentId_idx").on(table.commentId),
		],
	);

	const pendingUploads = sqliteTable(
		"pending_uploads",
		{
			id: text("id").primaryKey(),
			key: text("key").notNull(),
			kind: text("kind").notNull(),
			orgId: text("org_id").references(() => organization.id, {
				onDelete: "cascade",
			}),
			userId: text("user_id")
				.notNull()
				.references(() => user.id, { onDelete: "cascade" }),
			targetId: text("target_id"),
			declaredSize: integer("declared_size").notNull(),
			contentType: text("content_type").notNull(),
			expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			uniqueIndex("pending_uploads_key_uq").on(table.key),
			index("pending_uploads_orgId_expiresAt_idx").on(
				table.orgId,
				table.expiresAt,
			),
			index("pending_uploads_expiresAt_idx").on(table.expiresAt),
		],
	);

	const mediaAssets = sqliteTable(
		"media_assets",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id").references(() => organization.id, {
				onDelete: "cascade",
			}),
			ownerUserId: text("owner_user_id").references(() => user.id, {
				onDelete: "set null",
			}),
			kind: text("kind").notNull(),
			key: text("key").notNull(),
			filename: text("filename"),
			contentType: text("content_type").notNull(),
			size: integer("size").notNull(),
			supersededAt: integer("superseded_at", { mode: "timestamp_ms" }),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			uniqueIndex("media_assets_key_uq").on(table.key),
			index("media_assets_orgId_kind_idx").on(table.orgId, table.kind),
			index("media_assets_ownerUserId_kind_idx").on(
				table.ownerUserId,
				table.kind,
			),
			index("media_assets_supersededAt_idx").on(table.supersededAt),
		],
	);

	const apiKeys = sqliteTable(
		"api_keys",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			name: text("name").notNull(),
			prefix: text("prefix").notNull(),
			keyHash: text("key_hash").notNull(),
			// Cumulative scopes: read < write < admin. Keys predating scopes keep
			// read/write (v1 behaviour) but never gain admin implicitly.
			scopes: text("scopes", { mode: "json" })
				.$type<string[]>()
				.notNull()
				.default(sql`'["read","write"]'`),
			createdById: text("created_by_id").references(() => user.id, {
				onDelete: "set null",
			}),
			lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
			revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			uniqueIndex("apiKeys_keyHash_uq").on(table.keyHash),
			index("apiKeys_orgId_idx").on(table.orgId),
		],
	);

	const webhooks = sqliteTable(
		"webhooks",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			url: text("url").notNull(),
			secret: text("secret").notNull(),
			events: text("events").notNull(),
			active: integer("active", { mode: "boolean" }).notNull().default(true),
			createdById: text("created_by_id").references(() => user.id, {
				onDelete: "set null",
			}),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [index("webhooks_orgId_idx").on(table.orgId)],
	);

	const webhookDeliveries = sqliteTable(
		"webhook_deliveries",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			webhookId: text("webhook_id")
				.notNull()
				.references(() => webhooks.id, { onDelete: "cascade" }),
			event: text("event").notNull(),
			payload: text("payload").notNull(),
			status: text("status").notNull(),
			attempts: integer("attempts").notNull().default(0),
			responseStatus: integer("response_status"),
			lastError: text("last_error"),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
			lastAttemptAt: integer("last_attempt_at", { mode: "timestamp_ms" }),
		},
		(table) => [
			index("webhookDeliveries_webhookId_idx").on(table.webhookId),
			index("webhookDeliveries_orgId_createdAt_idx").on(
				table.orgId,
				sql`${table.createdAt} desc`,
			),
		],
	);

	const activities = sqliteTable(
		"activities",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			projectId: text("project_id")
				.notNull()
				.references(() => projects.id, { onDelete: "cascade" }),
			issueId: text("issue_id")
				.notNull()
				.references(() => issues.id, { onDelete: "cascade" }),
			actorId: text("actor_id")
				.notNull()
				.references(() => user.id, { onDelete: "cascade" }),
			action: text("action").notNull(),
			field: text("field"),
			oldValue: text("old_value"),
			newValue: text("new_value"),
			// Origin of the write: null for the web/HTTP app, otherwise e.g. "ai" or
			// "mcp" with the originating tool-call id.
			source: text("source"),
			sourceId: text("source_id"),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			index("activities_orgId_createdAt_idx").on(
				table.orgId,
				sql`${table.createdAt} desc`,
			),
			index("activities_issueId_idx").on(table.issueId),
		],
	);

	const aiConversations = sqliteTable(
		"ai_conversations",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(() => user.id, { onDelete: "cascade" }),
			title: text("title"),
			contextType: text("context_type"),
			contextId: text("context_id"),
			pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
			model: text("model"),
			lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
			deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
		},
		(table) => [
			index("aiConversations_orgId_userId_idx").on(table.orgId, table.userId),
			index("aiConversations_orgId_lastMessageAt_idx").on(
				table.orgId,
				sql`${table.lastMessageAt} desc`,
			),
		],
	);

	const aiMessages = sqliteTable(
		"ai_messages",
		{
			id: text("id").primaryKey(),
			conversationId: text("conversation_id")
				.notNull()
				.references(() => aiConversations.id, { onDelete: "cascade" }),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(() => user.id, { onDelete: "cascade" }),
			role: text("role").notNull(),
			parts: text("parts", { mode: "json" }).$type<unknown[]>().notNull(),
			status: text("status").notNull().default("complete"),
			model: text("model"),
			inputTokens: integer("input_tokens"),
			outputTokens: integer("output_tokens"),
			context: text("context", { mode: "json" }).$type<unknown>(),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			index("aiMessages_conversationId_createdAt_idx").on(
				table.conversationId,
				table.createdAt,
			),
			index("aiMessages_orgId_idx").on(table.orgId),
		],
	);

	const aiToolCalls = sqliteTable(
		"ai_tool_calls",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			userId: text("user_id").references(() => user.id, {
				onDelete: "set null",
			}),
			conversationId: text("conversation_id").references(
				() => aiConversations.id,
				{ onDelete: "set null" },
			),
			surface: text("surface").notNull(),
			toolName: text("tool_name").notNull(),
			effect: text("effect").notNull(),
			status: text("status").notNull().default("succeeded"),
			inputHash: text("input_hash"),
			inputSummary: text("input_summary"),
			idempotencyKey: text("idempotency_key"),
			errorCode: text("error_code"),
			durationMs: integer("duration_ms"),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			uniqueIndex("aiToolCalls_orgId_idempotencyKey_uq")
				.on(table.orgId, table.idempotencyKey)
				.where(sql`${table.idempotencyKey} is not null`),
			index("aiToolCalls_orgId_createdAt_idx").on(
				table.orgId,
				sql`${table.createdAt} desc`,
			),
		],
	);

	const aiUsageDaily = sqliteTable(
		"ai_usage_daily",
		{
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(() => user.id, { onDelete: "cascade" }),
			// UTC calendar day, formatted YYYY-MM-DD.
			day: text("day").notNull(),
			requests: integer("requests").notNull().default(0),
			inputTokens: integer("input_tokens").notNull().default(0),
			outputTokens: integer("output_tokens").notNull().default(0),
			toolCalls: integer("tool_calls").notNull().default(0),
		},
		(table) => [
			primaryKey({ columns: [table.orgId, table.userId, table.day] }),
			index("aiUsageDaily_orgId_day_idx").on(table.orgId, table.day),
		],
	);

	const orgAiSettings = sqliteTable("org_ai_settings", {
		orgId: text("org_id")
			.primaryKey()
			.references(() => organization.id, { onDelete: "cascade" }),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		defaultModel: text("default_model"),
		retentionDays: integer("retention_days").notNull().default(30),
		strictMcpWrites: integer("strict_mcp_writes", { mode: "boolean" })
			.notNull()
			.default(false),
		updatedBy: text("updated_by").references(() => user.id, {
			onDelete: "set null",
		}),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampDefault)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	});

	const subscriptions = sqliteTable("subscriptions", {
		orgId: text("org_id")
			.primaryKey()
			.references(() => organization.id, { onDelete: "cascade" }),
		plan: text("plan").notNull().default("free"),
		status: text("status").notNull().default("active"),
		stripeCustomerId: text("stripe_customer_id"),
		stripeSubscriptionId: text("stripe_subscription_id"),
		seats: integer("seats").notNull().default(0),
		currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(timestampDefault)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampDefault)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	});

	/**
	 * Saved issue views. Personal views are owner-scoped; shared views are read by
	 * every organization member. `query` is a validated `IssueQuery` tree (see
	 * `@workspace/shared`), stored as JSON.
	 */
	const views = sqliteTable(
		"views",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			projectId: text("project_id").references(() => projects.id, {
				onDelete: "cascade",
			}),
			name: text("name").notNull(),
			description: text("description"),
			ownerId: text("owner_id")
				.notNull()
				.references(() => user.id, { onDelete: "cascade" }),
			shared: integer("shared", { mode: "boolean" }).notNull().default(false),
			query: text("query", { mode: "json" }).$type<IssueQuery>().notNull(),
			layout: text("layout").notNull().default("list"),
			isDefault: integer("is_default", { mode: "boolean" })
				.notNull()
				.default(false),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			index("views_orgId_projectId_idx").on(table.orgId, table.projectId),
			index("views_orgId_ownerId_idx").on(table.orgId, table.ownerId),
			// At most one default view per owner; writes clear the previous default
			// in the same batch, so the index is never momentarily violated.
			uniqueIndex("views_orgId_ownerId_default_uq")
				.on(table.orgId, table.ownerId)
				.where(sql`${table.isDefault} = ${trueLiteral}`),
		],
	);

	/**
	 * Who follows an issue and why. Automatic reasons are recorded when the event
	 * happens (creator/assignee/commenter/mention); `manual` comes from the
	 * subscription toggle. `muted` keeps the subscription but suppresses
	 * notifications.
	 */
	const issueSubscriptions = sqliteTable(
		"issue_subscriptions",
		{
			issueId: text("issue_id")
				.notNull()
				.references(() => issues.id, { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(() => user.id, { onDelete: "cascade" }),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			// creator | assignee | commenter | mention | manual
			reason: text("reason").notNull().default("manual"),
			muted: integer("muted", { mode: "boolean" }).notNull().default(false),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			primaryKey({ columns: [table.issueId, table.userId] }),
			index("issueSubscriptions_orgId_userId_idx").on(
				table.orgId,
				table.userId,
			),
			index("issueSubscriptions_issueId_idx").on(table.issueId),
		],
	);

	/**
	 * Personal inbox. Notifications are owner-scoped: every read/write filters by
	 * both orgId and userId, so a notification id never leaks across users.
	 */
	const notifications = sqliteTable(
		"notifications",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(() => user.id, { onDelete: "cascade" }),
			// issue_assigned | issue_status_changed | issue_commented |
			// comment_reply | comment_mention | comment_resolved |
			// recurring_issue_created
			type: text("type").notNull(),
			issueId: text("issue_id")
				.notNull()
				.references(() => issues.id, { onDelete: "cascade" }),
			commentId: text("comment_id").references(() => comments.id, {
				onDelete: "set null",
			}),
			activityId: text("activity_id").references(() => activities.id, {
				onDelete: "set null",
			}),
			actorId: text("actor_id").references(() => user.id, {
				onDelete: "set null",
			}),
			readAt: integer("read_at", { mode: "timestamp_ms" }),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			index("notifications_userId_createdAt_idx").on(
				table.userId,
				sql`${table.createdAt} desc`,
			),
			index("notifications_userId_readAt_idx").on(table.userId, table.readAt),
			index("notifications_orgId_userId_idx").on(table.orgId, table.userId),
			// Retention cleanup scans by read time (read rows) and creation time
			// (unread rows); without these it would full-scan every cron tick.
			index("notifications_readAt_idx").on(table.readAt),
			index("notifications_createdAt_idx").on(table.createdAt),
		],
	);

	/** One row per (comment, user, emoji); toggled by the reactions endpoint. */
	const commentReactions = sqliteTable(
		"comment_reactions",
		{
			commentId: text("comment_id")
				.notNull()
				.references(() => comments.id, { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(() => user.id, { onDelete: "cascade" }),
			emoji: text("emoji").notNull(),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			primaryKey({ columns: [table.commentId, table.userId, table.emoji] }),
			index("commentReactions_commentId_idx").on(table.commentId),
		],
	);

	/**
	 * Mentions resolved from `@[name](user:ID)` markup at write time. Only
	 * organization members are stored; unknown ids are ignored.
	 */
	const commentMentions = sqliteTable(
		"comment_mentions",
		{
			commentId: text("comment_id")
				.notNull()
				.references(() => comments.id, { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(() => user.id, { onDelete: "cascade" }),
		},
		(table) => [
			primaryKey({ columns: [table.commentId, table.userId] }),
			index("commentMentions_userId_idx").on(table.userId),
		],
	);

	/**
	 * Per-user favorites ("pinned" issues/projects). Owner-scoped: every read and
	 * write filters by both orgId and userId, so one member's favorites never leak
	 * to another. The unique index also makes POST idempotent.
	 */
	const favorites = sqliteTable(
		"favorites",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(() => user.id, { onDelete: "cascade" }),
			// issue | project
			entityType: text("entity_type").notNull(),
			entityId: text("entity_id").notNull(),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			uniqueIndex("favorites_userId_entityType_entityId_uq").on(
				table.userId,
				table.entityType,
				table.entityId,
			),
			index("favorites_orgId_userId_idx").on(table.orgId, table.userId),
		],
	);

	/**
	 * Reusable issue prefills. Templates carry creation-time defaults only; creating
	 * an issue from a template stays a client-side action. A null projectId makes
	 * the template organization-wide (the partial unique index keeps those names
	 * unique too, since SQLite treats NULLs as distinct in the composite index).
	 */
	const issueTemplates = sqliteTable(
		"issue_templates",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			projectId: text("project_id").references(() => projects.id, {
				onDelete: "cascade",
			}),
			name: text("name").notNull(),
			title: text("title").notNull(),
			description: text("description"),
			statusId: text("status_id").references(() => issueStatuses.id, {
				onDelete: "set null",
			}),
			priority: integer("priority"),
			labelIds: text("label_ids", { mode: "json" })
				.$type<string[]>()
				.notNull()
				.default(sql`'[]'`),
			estimate: integer("estimate"),
			createdById: text("created_by_id").references(() => user.id, {
				onDelete: "set null",
			}),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			uniqueIndex("issueTemplates_orgId_projectId_name_uq").on(
				table.orgId,
				table.projectId,
				table.name,
			),
			uniqueIndex("issueTemplates_orgId_name_orgLevel_uq")
				.on(table.orgId, table.name)
				.where(sql`${table.projectId} is null`),
			index("issueTemplates_orgId_idx").on(table.orgId),
		],
	);

	/**
	 * Recurring issue templates: a snapshot of issue fields plus a cadence. The
	 * scheduled handler promotes each due row into a real issue and advances
	 * `nextRunAt`. Source issues are only read when the recurrence is created, so
	 * editing or deleting the source issue never affects the recurrence.
	 */
	const issueRecurrences = sqliteTable(
		"issue_recurrences",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			projectId: text("project_id")
				.notNull()
				.references(() => projects.id, { onDelete: "cascade" }),
			title: text("title").notNull(),
			description: text("description"),
			// Deleting the status detaches it; issue creation falls back to the
			// organization default status.
			statusId: text("status_id").references(() => issueStatuses.id, {
				onDelete: "set null",
			}),
			priority: integer("priority").notNull().default(0),
			assigneeId: text("assignee_id").references(() => user.id, {
				onDelete: "set null",
			}),
			labelIds: text("label_ids", { mode: "json" })
				.$type<string[]>()
				.notNull()
				.default(sql`'[]'`),
			estimate: integer("estimate"),
			/** daily | weekly | monthly */
			cadence: text("cadence").notNull(),
			nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }).notNull(),
			/**
			 * UTC day-of-month that monthly runs anchor to (1-31). Monthly advances
			 * clamp to the target month but return to this day, so Jan 31 →
			 * Feb 28 → Mar 31 instead of drifting to the 28th forever.
			 */
			anchorDay: integer("anchor_day").notNull().default(1),
			lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
			active: integer("active", { mode: "boolean" }).notNull().default(true),
			createdById: text("created_by_id").references(() => user.id, {
				onDelete: "set null",
			}),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			index("issueRecurrences_orgId_nextRunAt_idx").on(
				table.orgId,
				table.nextRunAt,
			),
			index("issueRecurrences_projectId_idx").on(table.projectId),
		],
	);

	/**
	 * Sparse org override of a meter's price card. Missing rows use the plan
	 * catalog in `@workspace/shared`.
	 */
	const quotaPolicies = sqliteTable(
		"quota_policies",
		{
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			meter: text("meter").notNull(),
			mode: text("mode").notNull(),
			included: integer("included").notNull(),
			creditRate: integer("credit_rate").notNull(),
			updatedBy: text("updated_by").references(() => user.id, {
				onDelete: "set null",
			}),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			primaryKey({ columns: [table.orgId, table.meter] }),
			index("quotaPolicies_orgId_idx").on(table.orgId),
		],
	);

	/** Included-balance counter for one meter and period. */
	const usageBalances = sqliteTable(
		"usage_balances",
		{
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			meter: text("meter").notNull(),
			periodKey: text("period_key").notNull(),
			granted: integer("granted").notNull().default(0),
			consumed: integer("consumed").notNull().default(0),
			reserved: integer("reserved").notNull().default(0),
		},
		(table) => [
			primaryKey({
				columns: [table.orgId, table.meter, table.periodKey],
			}),
		],
	);

	/** Shared credit pool. Grants do not reset with the calendar month. */
	const creditBalances = sqliteTable("credit_balances", {
		orgId: text("org_id")
			.primaryKey()
			.references(() => organization.id, { onDelete: "cascade" }),
		balance: integer("balance").notNull().default(0),
		reserved: integer("reserved").notNull().default(0),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampDefault)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	});

	const usageLedger = sqliteTable(
		"usage_ledger",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			meter: text("meter").notNull(),
			quantity: integer("quantity").notNull(),
			creditsDelta: integer("credits_delta").notNull().default(0),
			actorType: text("actor_type"),
			actorId: text("actor_id"),
			sourceType: text("source_type").notNull(),
			sourceId: text("source_id"),
			dimensions: text("dimensions", { mode: "json" }).$type<
				Record<string, unknown>
			>(),
			idempotencyKey: text("idempotency_key").notNull(),
			periodKey: text("period_key"),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			uniqueIndex("usageLedger_orgId_idempotencyKey_uq").on(
				table.orgId,
				table.idempotencyKey,
			),
			index("usageLedger_orgId_createdAt_idx").on(
				table.orgId,
				sql`${table.createdAt} desc`,
			),
		],
	);

	const quotaReservations = sqliteTable(
		"quota_reservations",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			meter: text("meter").notNull(),
			periodKey: text("period_key").notNull(),
			estimated: integer("estimated").notNull(),
			settled: integer("settled"),
			meterHeld: integer("meter_held").notNull().default(0),
			creditsHeld: integer("credits_held").notNull().default(0),
			status: text("status").notNull().default("held"),
			idempotencyKey: text("idempotency_key").notNull(),
			/** Set when a settle/release batch wins, so the rest of that batch can match it. */
			settleToken: text("settle_token"),
			actorId: text("actor_id"),
			dimensions: text("dimensions", { mode: "json" }).$type<
				Record<string, unknown>
			>(),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			uniqueIndex("quotaReservations_orgId_idempotencyKey_uq").on(
				table.orgId,
				table.idempotencyKey,
			),
			index("quotaReservations_orgId_status_idx").on(table.orgId, table.status),
		],
	);

	const auditEvents = sqliteTable(
		"audit_events",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id").references(() => organization.id, {
				onDelete: "cascade",
			}),
			actorType: text("actor_type").notNull(),
			actorId: text("actor_id"),
			action: text("action").notNull(),
			targetType: text("target_type"),
			targetId: text("target_id"),
			result: text("result").notNull().default("success"),
			requestId: text("request_id"),
			ipAddress: text("ip_address"),
			userAgent: text("user_agent"),
			before: text("before", { mode: "json" }).$type<Record<string, unknown>>(),
			after: text("after", { mode: "json" }).$type<Record<string, unknown>>(),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			index("auditEvents_orgId_createdAt_idx").on(
				table.orgId,
				sql`${table.createdAt} desc`,
			),
			index("auditEvents_orgId_action_createdAt_idx").on(
				table.orgId,
				table.action,
				sql`${table.createdAt} desc`,
			),
			index("auditEvents_actorId_createdAt_idx").on(
				table.actorId,
				sql`${table.createdAt} desc`,
			),
		],
	);

	return {
		user,
		session,
		account,
		verification,
		organization,
		member,
		invitation,
		jwks,
		oauthClient,
		oauthResource,
		oauthClientResource,
		oauthRefreshToken,
		oauthAccessToken,
		oauthConsent,
		oauthClientAssertion,
		authRelations,
		projects,
		cycles,
		issueStatuses,
		issues,
		labels,
		issueLabels,
		issueRelations,
		projectUpdates,
		comments,
		attachments,
		pendingUploads,
		mediaAssets,
		apiKeys,
		webhooks,
		webhookDeliveries,
		activities,
		aiConversations,
		aiMessages,
		aiToolCalls,
		aiUsageDaily,
		orgAiSettings,
		subscriptions,
		views,
		issueSubscriptions,
		notifications,
		commentReactions,
		commentMentions,
		favorites,
		issueTemplates,
		issueRecurrences,
		quotaPolicies,
		usageBalances,
		creditBalances,
		usageLedger,
		quotaReservations,
		auditEvents,
	};
};

export type AppSchema = ReturnType<typeof defineSchema>;
