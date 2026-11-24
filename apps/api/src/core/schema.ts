import { defineRelationsPart, sql } from "drizzle-orm";
import type { SchemaKit } from "../db/kit";

/** Identity, organization, audit and activity tables owned by core. */
export const defineCoreTables = (kit: SchemaKit) => {
	const { sqliteTable, text, integer, index, timestampDefault } = kit;

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

	const activities = sqliteTable(
		"activities",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(() => organization.id, { onDelete: "cascade" }),
			projectId: text("project_id")
				.notNull()
				.references(kit.ref("projects", "id"), { onDelete: "cascade" }),
			issueId: text("issue_id")
				.notNull()
				.references(kit.ref("issues", "id"), { onDelete: "cascade" }),
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

	// ---------------------------------------------------------------------------
	// Plan subscriptions
	//
	// Core reads the plan on every quota check (member/org admin lists join it
	// too), so the table lives with core; the billing feature owns the writes
	// and the surrounding quota ledger tables.
	// ---------------------------------------------------------------------------
	const subscriptions = sqliteTable("subscriptions", {
		orgId: text("org_id")
			.primaryKey()
			.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
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

	return {
		user,
		session,
		account,
		verification,
		organization,
		member,
		invitation,
		authRelations,
		auditEvents,
		activities,
		subscriptions,
	};
};
