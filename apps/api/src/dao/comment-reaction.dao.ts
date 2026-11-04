import { and, eq, inArray } from "drizzle-orm";
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
	 * Toggles one (comment, user, emoji) row. The delete runs first: if it
	 * removed a row the toggle is an "off"; otherwise the insert is guarded by
	 * `onConflictDoNothing`, so a duplicate/concurrent request can never trip
	 * the primary key.
	 */
	toggle: async (
		commentId: string,
		userId: string,
		emoji: string,
	): Promise<boolean> => {
		const [deleted] = (await db.batch([
			db
				.delete(commentReactions)
				.where(
					and(
						eq(commentReactions.commentId, commentId),
						eq(commentReactions.userId, userId),
						eq(commentReactions.emoji, emoji),
					),
				)
				.returning({ commentId: commentReactions.commentId }),
		] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]])) as [
			{ commentId: string }[],
		];
		if (deleted.length > 0) {
			return false;
		}
		await db
			.insert(commentReactions)
			.values({ commentId, userId, emoji })
			.onConflictDoNothing();
		return true;
	},
});

export type CommentReactionDao = ReturnType<typeof createCommentReactionDao>;
