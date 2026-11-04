import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { commentReactions } from "../db/schema";
import type { Database } from "../db/types";

export type CommentReactionRow = {
	commentId: string;
	userId: string;
	emoji: string;
};

export const createCommentReactionDao = (db: Database) => ({
	listByComments: async (
		commentIds: string[],
	): Promise<CommentReactionRow[]> => {
		if (commentIds.length === 0) {
			return [];
		}
		return await db
			.select({
				commentId: commentReactions.commentId,
				userId: commentReactions.userId,
				emoji: commentReactions.emoji,
			})
			.from(commentReactions)
			.where(inArray(commentReactions.commentId, commentIds));
	},

	/**
	 * Toggles one (comment, user, emoji) row atomically in a single batch.
	 * The DELETE runs first; `changes()` reports whether it removed anything,
	 * and the INSERT ... SELECT only fires when it did not — so a concurrent
	 * or duplicated request can never end up with both statements applying
	 * (net result is always exactly one flip).
	 */
	toggle: async (
		commentId: string,
		userId: string,
		emoji: string,
	): Promise<boolean> => {
		const results = await db.batch([
			db
				.delete(commentReactions)
				.where(
					and(
						eq(commentReactions.commentId, commentId),
						eq(commentReactions.userId, userId),
						eq(commentReactions.emoji, emoji),
					),
				),
			db.insert(commentReactions).select(
				sql`SELECT ${commentId}, ${userId}, ${emoji},
						cast(unixepoch('subsecond') * 1000 as integer)
						WHERE (SELECT changes()) = 0`,
			),
		] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
		// The insert's result is non-empty exactly when the toggle turned "on".
		const inserted = results[1] as unknown[];
		return inserted.length > 0;
	},
});

export type CommentReactionDao = ReturnType<typeof createCommentReactionDao>;
