import { sql } from "drizzle-orm";
import type { SchemaKit } from "../../db/kit";

/** Organization API keys for the public API and MCP. */
export const defineApiKeysTables = (kit: SchemaKit) => {
	const { sqliteTable, text, integer, index, uniqueIndex, timestampDefault } =
		kit;

	const apiKeys = sqliteTable(
		"api_keys",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			name: text("name").notNull(),
			prefix: text("prefix").notNull(),
			keyHash: text("key_hash").notNull(),
			// Cumulative scopes: read < write < admin. Keys predating scopes keep
			// read/write (v1 behaviour) but never gain admin implicitly.
			scopes: text("scopes", { mode: "json" })
				.$type<string[]>()
				.notNull()
				.default(sql`'["read","write"]'`),
			createdById: text("created_by_id").references(kit.ref("user", "id"), {
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

	return {
		apiKeys,
	};
};
