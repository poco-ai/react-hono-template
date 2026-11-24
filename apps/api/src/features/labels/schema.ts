import type { SchemaKit } from "../../db/kit";

/** Organization labels applied to issues. */
export const defineLabelsTables = (kit: SchemaKit) => {
	const { sqliteTable, text, integer, uniqueIndex, timestampDefault } = kit;

	const labels = sqliteTable(
		"labels",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
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

	return {
		labels,
	};
};
