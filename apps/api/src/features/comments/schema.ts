import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { SchemaKit } from "../../db/kit";

/** Issue comments, reactions and resolved mentions. */
export const defineCommentsTables = (kit: SchemaKit) => {
	const { sqliteTable, text, integer, index, primaryKey, timestampDefault } =
		kit;

	const comments = sqliteTable(
		"comments",
		{
			id: text("id").primaryKey(),
			orgId: text("org_id")
				.notNull()
				.references(kit.ref("organization", "id"), { onDelete: "cascade" }),
			issueId: text("issue_id")
				.notNull()
				.references(kit.ref("issues", "id"), { onDelete: "cascade" }),
			authorId: text("author_id")
				.notNull()
				.references(kit.ref("user", "id"), { onDelete: "cascade" }),
			// Replies are one level deep only: the parent must be a top-level
			// comment (the service rejects replies to replies).
			parentId: text("parent_id").references(
				(): AnySQLiteColumn => comments.id,
				{
					onDelete: "cascade",
				},
			),
			body: text("body").notNull(),
			// Thread resolution (top-level comments only).
			resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
			resolvedById: text("resolved_by_id").references(kit.ref("user", "id"), {
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
			index("comments_issueId_idx").on(table.issueId),
			index("comments_parentId_idx").on(table.parentId),
		],
	);

	/** One row per (comment, user, emoji); toggled by the reactions endpoint. */
	const commentReactions = sqliteTable(
		"comment_reactions",
		{
			commentId: text("comment_id")
				.notNull()
				.references(() => comments.id, { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(kit.ref("user", "id"), { onDelete: "cascade" }),
			emoji: text("emoji").notNull(),
			createdAt: integer("created_at", { mode: "timestamp_ms" })
				.default(timestampDefault)
				.notNull(),
		},
		(table) => [
			primaryKey({ columns: [table.commentId, table.userId, table.emoji] }),
			index("commentReactions_commentId_idx").on(table.commentId),
		],
	);

	/**
	 * Mentions resolved from `@[name](user:ID)` markup at write time. Only
	 * organization members are stored; unknown ids are ignored.
	 */
	const commentMentions = sqliteTable(
		"comment_mentions",
		{
			commentId: text("comment_id")
				.notNull()
				.references(() => comments.id, { onDelete: "cascade" }),
			userId: text("user_id")
				.notNull()
				.references(kit.ref("user", "id"), { onDelete: "cascade" }),
		},
		(table) => [
			primaryKey({ columns: [table.commentId, table.userId] }),
			index("commentMentions_userId_idx").on(table.userId),
		],
	);

	return {
		comments,
		commentReactions,
		commentMentions,
	};
};
