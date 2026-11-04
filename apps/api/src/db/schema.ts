import type { IssueQuery } from "@workspace/shared";
import { sql } from "drizzle-orm";
import {
	type AnySQLiteColumn,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { organization, user } from "./auth-schema";

export const projects = sqliteTable(
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
		archived: integer("archived", { mode: "boolean" }).notNull().default(false),
		nextNumber: integer("next_number").notNull().default(1),
		// Project health rollup: on_track | at_risk | off_track (null = unset).
		health: text("health"),
		targetDate: integer("target_date", { mode: "timestamp_ms" }),
		leadId: text("lead_id").references(() => user.id, { onDelete: "set null" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
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
export const cycles = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("cycles_projectId_number_uq").on(table.projectId, table.number),
		index("cycles_projectId_startsAt_idx").on(table.projectId, table.startsAt),
	],
);

export const issueStatuses = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("issueStatuses_orgId_name_uq").on(table.orgId, table.name),
		// At most one default status per organization; writes clear the previous
		// default first so the partial index is never momentarily violated.
		uniqueIndex("issueStatuses_orgId_default_uq")
			.on(table.orgId)
			.where(sql`${table.isDefault} = 1`),
		index("issueStatuses_orgId_idx").on(table.orgId),
	],
);

export const issues = sqliteTable(
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
		deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("issues_projectId_number_uq").on(table.projectId, table.number),
		index("issues_orgId_idx").on(table.orgId),
		index("issues_orgId_statusId_idx").on(table.orgId, table.statusId),
		index("issues_orgId_assigneeId_idx").on(table.orgId, table.assigneeId),
		index("issues_orgId_parentId_idx").on(table.orgId, table.parentId),
		index("issues_orgId_cycleId_idx").on(table.orgId, table.cycleId),
	],
);

export const labels = sqliteTable(
	"labels",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		color: text("color").notNull().default("#94a3b8"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [uniqueIndex("labels_orgId_name_uq").on(table.orgId, table.name)],
);

export const issueLabels = sqliteTable(
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
export const issueRelations = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
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
export const projectUpdates = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
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

export const comments = sqliteTable(
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
		parentId: text("parent_id").references((): AnySQLiteColumn => comments.id, {
			onDelete: "cascade",
		}),
		body: text("body").notNull(),
		// Thread resolution (top-level comments only).
		resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
		resolvedById: text("resolved_by_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("comments_issueId_idx").on(table.issueId),
		index("comments_parentId_idx").on(table.parentId),
	],
);

export const attachments = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("attachments_key_uq").on(table.key),
		index("attachments_issueId_idx").on(table.issueId),
		index("attachments_orgId_createdAt_idx").on(table.orgId, table.createdAt),
		index("attachments_commentId_idx").on(table.commentId),
	],
);

export const pendingUploads = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
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

export const mediaAssets = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
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

export const apiKeys = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("apiKeys_keyHash_uq").on(table.keyHash),
		index("apiKeys_orgId_idx").on(table.orgId),
	],
);

export const webhooks = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("webhooks_orgId_idx").on(table.orgId)],
);

export const webhookDeliveries = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
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

export const activities = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
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

export const aiConversations = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
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

export const aiMessages = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
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

export const aiToolCalls = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
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

export const aiUsageDaily = sqliteTable(
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

export const orgAiSettings = sqliteTable("org_ai_settings", {
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
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const subscriptions = sqliteTable("subscriptions", {
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
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

/**
 * Saved issue views. Personal views are owner-scoped; shared views are read by
 * every organization member. `query` is a validated `IssueQuery` tree (see
 * `@workspace/shared`), stored as JSON.
 */
export const views = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
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
			.where(sql`${table.isDefault} = 1`),
	],
);

/**
 * Who follows an issue and why. Automatic reasons are recorded when the event
 * happens (creator/assignee/commenter/mention); `manual` comes from the
 * subscription toggle. `muted` keeps the subscription but suppresses
 * notifications.
 */
export const issueSubscriptions = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.issueId, table.userId] }),
		index("issueSubscriptions_orgId_userId_idx").on(table.orgId, table.userId),
		index("issueSubscriptions_issueId_idx").on(table.issueId),
	],
);

/**
 * Personal inbox. Notifications are owner-scoped: every read/write filters by
 * both orgId and userId, so a notification id never leaks across users.
 */
export const notifications = sqliteTable(
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
		// comment_reply | comment_mention | comment_resolved
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		index("notifications_userId_createdAt_idx").on(
			table.userId,
			sql`${table.createdAt} desc`,
		),
		index("notifications_userId_readAt_idx").on(table.userId, table.readAt),
		index("notifications_orgId_userId_idx").on(table.orgId, table.userId),
	],
);

/** One row per (comment, user, emoji); toggled by the reactions endpoint. */
export const commentReactions = sqliteTable(
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
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
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
export const commentMentions = sqliteTable(
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
