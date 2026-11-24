import { sql } from "drizzle-orm";
import type { SchemaKit } from "../../db/kit";

/** Project status updates posted by members. */
export const defineProjectUpdatesTables = (kit: SchemaKit) => {
	const { sqliteTable, text, integer, index, timestampDefault } = kit;

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
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			projectId: text("project_id")
				.notNull()
				.references(kit.ref("projects", "id"), { onDelete: "cascade" }),
			authorId: text("author_id").references(kit.ref("user", "id"), {
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

	return {
		projectUpdates,
	};
};
