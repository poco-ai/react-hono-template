import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { SchemaKit } from "../../db/kit";

/** Issues plus their label links and canonical relation rows. */
export const defineIssuesTables = (kit: SchemaKit) => {
	const {
		sqliteTable,
		text,
		integer,
		index,
		uniqueIndex,
		primaryKey,
		timestampDefault,
	} = kit;

	const issues = sqliteTable(
		"issues",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			projectId: text("project_id")
				.notNull()
				.references(kit.ref("projects", "id"), { onDelete: "cascade" }),
			number: integer("number").notNull(),
			title: text("title").notNull(),
			description: text("description"),
			// Self-reference for sub-issues. At most two levels are allowed; the
			// service enforces depth and project/org consistency.
			parentId: text("parent_id").references((): AnySQLiteColumn => issues.id, {
				onDelete: "set null",
			}),
			statusId: text("status_id")
				.notNull()
				.references(kit.ref("issue_statuses", "id"), { onDelete: "restrict" }),
			// Planning cycle; deleting a cycle detaches its issues (set null).
			cycleId: text("cycle_id").references(kit.ref("cycles", "id"), {
				onDelete: "set null",
			}),
			priority: integer("priority").notNull().default(0),
			assigneeId: text("assignee_id").references(kit.ref("user", "id"), {
				onDelete: "set null",
			}),
			createdById: text("created_by_id").references(kit.ref("user", "id"), {
				onDelete: "set null",
			}),
			dueDate: integer("due_date", { mode: "timestamp_ms" }),
			estimate: integer("estimate"),
			/** Soft delete (not restorable through the API). */
			deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
			/**
			 * Archival: hidden from lists, search, statistics and cycle/sub-issue
			 * progress, but the detail page stays reachable and `restore` clears it.
			 * Distinct from `deletedAt`, which stays a one-way soft delete.
			 */
			archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
			updatedAt: integer("updated_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.$onUpdate(() => /* @__PURE__ */ new Date())
				.notNull(),
		},
		(table) => [
			uniqueIndex("issues_projectId_number_uq").on(
				table.projectId,
				table.number,
			),
			index("issues_orgId_idx").on(table.orgId),
			index("issues_orgId_statusId_idx").on(table.orgId, table.statusId),
			index("issues_orgId_assigneeId_idx").on(table.orgId, table.assigneeId),
			index("issues_orgId_parentId_idx").on(table.orgId, table.parentId),
			index("issues_orgId_cycleId_idx").on(table.orgId, table.cycleId),
			index("issues_orgId_archivedAt_idx").on(table.orgId, table.archivedAt),
		],
	);

	const issueLabels = sqliteTable(
		"issue_labels",
		{
			issueId: text("issue_id")
				.notNull()
				.references(() => issues.id, { onDelete: "cascade" }),
			labelId: text("label_id")
				.notNull()
				.references(kit.ref("labels", "id"), { onDelete: "cascade" }),
		},
		(table) => [
			primaryKey({ columns: [table.issueId, table.labelId] }),
			// Label filters resolve issue ids by label; the PK only covers issueId.
			index("issue_labels_labelId_idx").on(table.labelId),
		],
	);

	/**
	 * Issue relations in canonical storage form: `blocks` is directed (A blocks B)
	 * while `related` and `duplicates` are symmetric (pair ids sorted, one row per
	 * pair). The API/UI present blocks from the current issue's point of view
	 * (blocks / blockedBy) and show related/duplicates as symmetric groups.
	 */
	const issueRelations = sqliteTable(
		"issue_relations",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			issueId: text("issue_id")
				.notNull()
				.references(() => issues.id, { onDelete: "cascade" }),
			relatedIssueId: text("related_issue_id")
				.notNull()
				.references(() => issues.id, { onDelete: "cascade" }),
			// blocks | related | duplicates
			type: text("type").notNull(),
			createdById: text("created_by_id").references(kit.ref("user", "id"), {
				onDelete: "set null",
			}),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			uniqueIndex("issueRelations_issueId_relatedIssueId_type_uq").on(
				table.issueId,
				table.relatedIssueId,
				table.type,
			),
			index("issueRelations_orgId_idx").on(table.orgId),
			index("issueRelations_relatedIssueId_idx").on(table.relatedIssueId),
		],
	);

	return {
		issues,
		issueLabels,
		issueRelations,
	};
};
