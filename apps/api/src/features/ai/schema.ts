import { sql } from "drizzle-orm";
import type { SchemaKit } from "../../db/kit";

/** AI conversations, messages, tool-call audit, usage and org settings. */
export const defineAiTables = (kit: SchemaKit) => {
	const {
		sqliteTable,
		text,
		integer,
		index,
		uniqueIndex,
		primaryKey,
		timestampDefault,
	} = kit;

	const aiConversations = sqliteTable(
		"ai_conversations",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(kit.ref("user", "id"), { onDelete: "cascade" }),
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
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(kit.ref("user", "id"), { onDelete: "cascade" }),
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
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			userId: text("user_id").references(kit.ref("user", "id"), {
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
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(kit.ref("user", "id"), { onDelete: "cascade" }),
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
			.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		defaultModel: text("default_model"),
		retentionDays: integer("retention_days").notNull().default(30),
		strictMcpWrites: integer("strict_mcp_writes", { mode: "boolean" })
			.notNull()
			.default(false),
		updatedBy: text("updated_by").references(kit.ref("user", "id"), {
			onDelete: "set null",
		}),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(timestampDefault)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	});

	return {
		aiConversations,
		aiMessages,
		aiToolCalls,
		aiUsageDaily,
		orgAiSettings,
	};
};
