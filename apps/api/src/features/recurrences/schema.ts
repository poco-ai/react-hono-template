import { sql } from "drizzle-orm";
import type { SchemaKit } from "../../db/kit";

/** Recurring issue templates promoted by the scheduler. */
export const defineRecurrencesTables = (kit: SchemaKit) => {
	const { sqliteTable, text, integer, index, timestampDefault } = kit;

	/**
	 * Recurring issue templates: a snapshot of issue fields plus a cadence. The
	 * scheduled handler promotes each due row into a real issue and advances
	 * `nextRunAt`. Source issues are only read when the recurrence is created, so
	 * editing or deleting the source issue never affects the recurrence.
	 */
	const issueRecurrences = sqliteTable(
		"issue_recurrences",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			projectId: text("project_id")
				.notNull()
				.references(kit.ref("projects", "id"), { onDelete: "cascade" }),
			title: text("title").notNull(),
			description: text("description"),
			// Deleting the status detaches it; issue creation falls back to the
			// organization default status.
			statusId: text("status_id").references(kit.ref("issue_statuses", "id"), {
				onDelete: "set null",
			}),
			priority: integer("priority").notNull().default(0),
			assigneeId: text("assignee_id").references(kit.ref("user", "id"), {
				onDelete: "set null",
			}),
			labelIds: text("label_ids", { mode: "json" })
				.$type<string[]>()
				.notNull()
				.default(sql`'[]'`),
			estimate: integer("estimate"),
			/** daily | weekly | monthly */
			cadence: text("cadence").notNull(),
			nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }).notNull(),
			/**
			 * UTC day-of-month that monthly runs anchor to (1-31). Monthly advances
			 * clamp to the target month but return to this day, so Jan 31 →
			 * Feb 28 → Mar 31 instead of drifting to the 28th forever.
			 */
			anchorDay: integer("anchor_day").notNull().default(1),
			lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
			active: integer("active", { mode: "boolean" }).notNull().default(true),
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
			index("issueRecurrences_orgId_nextRunAt_idx").on(
				table.orgId,
				table.nextRunAt,
			),
			index("issueRecurrences_projectId_idx").on(table.projectId),
		],
	);

	return {
		issueRecurrences,
	};
};
