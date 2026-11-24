import { sql } from "drizzle-orm";
import type { SchemaKit } from "../../db/kit";

/** Issue subscriptions and the personal notification inbox. */
export const defineNotificationsTables = (kit: SchemaKit) => {
	const { sqliteTable, text, integer, index, primaryKey, timestampDefault } =
		kit;

	/**
	 * Personal inbox. Notifications are owner-scoped: every read/write filters by
	 * both orgId and userId, so a notification id never leaks across users.
	 */
	const notifications = sqliteTable(
		"notifications",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(kit.ref("user", "id"), { onDelete: "cascade" }),
			// issue_assigned | issue_status_changed | issue_commented |
			// comment_reply | comment_mention | comment_resolved |
			// recurring_issue_created
			type: text("type").notNull(),
			issueId: text("issue_id")
				.notNull()
				.references(kit.ref("issues", "id"), { onDelete: "cascade" }),
			commentId: text("comment_id").references(kit.ref("comments", "id"), {
				onDelete: "set null",
			}),
			activityId: text("activity_id").references(kit.ref("activities", "id"), {
				onDelete: "set null",
			}),
			actorId: text("actor_id").references(kit.ref("user", "id"), {
				onDelete: "set null",
			}),
			readAt: integer("read_at", { mode: "timestamp_ms" }),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			index("notifications_userId_createdAt_idx").on(
				table.userId,
				sql`${table.createdAt} desc`,
			),
			index("notifications_userId_readAt_idx").on(table.userId, table.readAt),
			index("notifications_orgId_userId_idx").on(table.orgId, table.userId),
			// Retention cleanup scans by read time (read rows) and creation time
			// (unread rows); without these it would full-scan every cron tick.
			index("notifications_readAt_idx").on(table.readAt),
			index("notifications_createdAt_idx").on(table.createdAt),
		],
	);

	/**
	 * Who follows an issue and why. Automatic reasons are recorded when the event
	 * happens (creator/assignee/commenter/mention); `manual` comes from the
	 * subscription toggle. `muted` keeps the subscription but suppresses
	 * notifications.
	 */
	const issueSubscriptions = sqliteTable(
		"issue_subscriptions",
		{
			issueId: text("issue_id")
				.notNull()
				.references(kit.ref("issues", "id"), { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(kit.ref("user", "id"), { onDelete: "cascade" }),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			// creator | assignee | commenter | mention | manual
			reason: text("reason").notNull().default("manual"),
			muted: integer("muted", { mode: "boolean" }).notNull().default(false),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			primaryKey({ columns: [table.issueId, table.userId] }),
			index("issueSubscriptions_orgId_userId_idx").on(
				table.orgId,
				table.userId,
			),
			index("issueSubscriptions_issueId_idx").on(table.issueId),
		],
	);

	return {
		notifications,
		issueSubscriptions,
	};
};
