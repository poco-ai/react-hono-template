import type { SchemaKit } from "../../db/kit";

/** Time-boxed planning periods per project (Linear-style cycles). */
export const defineCyclesTables = (kit: SchemaKit) => {
	const { sqliteTable, text, integer, index, uniqueIndex, timestampDefault } =
		kit;

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
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			projectId: text("project_id")
				.notNull()
				.references(kit.ref("projects", "id"), { onDelete: "cascade" }),
			name: text("name").notNull(),
			number: integer("number").notNull(),
			startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
			endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
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

	return {
		cycles,
	};
};
