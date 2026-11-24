import { sql } from "drizzle-orm";
import type { SchemaKit } from "../../db/kit";

/** Organization webhooks and their delivery log. */
export const defineWebhooksTables = (kit: SchemaKit) => {
	const { sqliteTable, text, integer, index, timestampDefault } = kit;

	const webhooks = sqliteTable(
		"webhooks",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			url: text("url").notNull(),
			secret: text("secret").notNull(),
			events: text("events").notNull(),
			active: integer("active", { mode: "boolean" }).notNull().default(true),
			createdById: text("created_by_id").references(kit.ref("user", "id"), {
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
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
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

	return {
		webhooks,
		webhookDeliveries,
	};
};
