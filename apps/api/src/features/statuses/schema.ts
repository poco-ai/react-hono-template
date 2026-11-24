import { sql } from "drizzle-orm";
import type { SchemaKit } from "../../db/kit";

/** Organization issue workflow statuses. */
export const defineStatusesTables = (kit: SchemaKit) => {
	const {
		sqliteTable,
		text,
		integer,
		index,
		uniqueIndex,
		timestampDefault,
		trueLiteral,
	} = kit;

	const issueStatuses = sqliteTable(
		"issue_statuses",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			name: text("name").notNull(),
			// backlog | unstarted | started | completed | canceled
			category: text("category").notNull(),
			color: text("color").notNull(),
			position: integer("position").notNull().default(0),
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
			uniqueIndex("issueStatuses_orgId_name_uq").on(table.orgId, table.name),
			// At most one default status per organization; writes clear the previous
			// default first so the partial index is never momentarily violated.
			uniqueIndex("issueStatuses_orgId_default_uq")
				.on(table.orgId)
				.where(sql`${table.isDefault} = ${trueLiteral}`),
			index("issueStatuses_orgId_idx").on(table.orgId),
		],
	);

	return {
		issueStatuses,
	};
};
