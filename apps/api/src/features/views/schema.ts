import type { IssueQuery } from "@workspace/shared";
import { sql } from "drizzle-orm";
import type { SchemaKit } from "../../db/kit";

/** Saved issue views (personal or shared). */
export const defineViewsTables = (kit: SchemaKit) => {
	const {
		sqliteTable,
		text,
		integer,
		index,
		uniqueIndex,
		timestampDefault,
		trueLiteral,
	} = kit;

	/**
	 * Saved issue views. Personal views are owner-scoped; shared views are read by
	 * every organization member. `query` is a validated `IssueQuery` tree (see
	 * `@workspace/shared`), stored as JSON.
	 */
	const views = sqliteTable(
		"views",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			projectId: text("project_id").references(kit.ref("projects", "id"), {
				onDelete: "cascade",
			}),
			name: text("name").notNull(),
			description: text("description"),
			ownerId: text("owner_id")
				.notNull()
				.references(kit.ref("user", "id"), { onDelete: "cascade" }),
			shared: integer("shared", { mode: "boolean" }).notNull().default(false),
			query: text("query", { mode: "json" }).$type<IssueQuery>().notNull(),
			layout: text("layout").notNull().default("list"),
			isDefault: integer("is_default", { mode: "boolean" })
				.notNull()
				.default(false),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
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
				.where(sql`${table.isDefault} = ${trueLiteral}`),
		],
	);

	return {
		views,
	};
};
