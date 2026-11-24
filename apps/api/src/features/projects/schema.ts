import type { SchemaKit } from "../../db/kit";

/** Projects: the container every issue belongs to. */
export const defineProjectsTables = (kit: SchemaKit) => {
	const { sqliteTable, text, integer, index, uniqueIndex, timestampDefault } =
		kit;

	const projects = sqliteTable(
		"projects",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
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
			leadId: text("lead_id").references(kit.ref("user", "id"), {
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

	return {
		projects,
	};
};
