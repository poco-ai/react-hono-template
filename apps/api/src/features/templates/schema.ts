import { sql } from "drizzle-orm";
import type { SchemaKit } from "../../db/kit";

/** Reusable issue templates. */
export const defineTemplatesTables = (kit: SchemaKit) => {
	const { sqliteTable, text, integer, index, uniqueIndex, timestampDefault } =
		kit;

	/**
	 * Reusable issue prefills. Templates carry creation-time defaults only; creating
	 * an issue from a template stays a client-side action. A null projectId makes
	 * the template organization-wide (the partial unique index keeps those names
	 * unique too, since SQLite treats NULLs as distinct in the composite index).
	 */
	const issueTemplates = sqliteTable(
		"issue_templates",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			projectId: text("project_id").references(kit.ref("projects", "id"), {
				onDelete: "cascade",
			}),
			name: text("name").notNull(),
			title: text("title").notNull(),
			description: text("description"),
			statusId: text("status_id").references(kit.ref("issue_statuses", "id"), {
				onDelete: "set null",
			}),
			priority: integer("priority"),
			labelIds: text("label_ids", { mode: "json" })
				.$type<string[]>()
				.notNull()
				.default(sql`'[]'`),
			estimate: integer("estimate"),
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
			uniqueIndex("issueTemplates_orgId_projectId_name_uq").on(
				table.orgId,
				table.projectId,
				table.name,
			),
			uniqueIndex("issueTemplates_orgId_name_orgLevel_uq")
				.on(table.orgId, table.name)
				.where(sql`${table.projectId} is null`),
			index("issueTemplates_orgId_idx").on(table.orgId),
		],
	);

	return {
		issueTemplates,
	};
};
