import type { SchemaKit } from "../../db/kit";

/** Per-user pinned issues/projects. */
export const defineFavoritesTables = (kit: SchemaKit) => {
	const { sqliteTable, text, integer, index, uniqueIndex, timestampDefault } =
		kit;

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
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(kit.ref("user", "id"), { onDelete: "cascade" }),
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

	return {
		favorites,
	};
};
