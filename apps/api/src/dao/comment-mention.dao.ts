import { eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { user } from "../db/auth-schema";
import { commentMentions } from "../db/schema";
import type { Database } from "../db/types";

export type CommentMentionRow = {
	commentId: string;
	user: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	};
};

export const createCommentMentionDao = (db: Database) => ({
	listByComments: async (
		commentIds: string[],
	): Promise<CommentMentionRow[]> => {
		if (commentIds.length === 0) {
			return [];
		}
		return await db
			.select({
				commentId: commentMentions.commentId,
				// Joined columns need unique names inside D1 batches.
				user: {
					id: user.id.as("mention_user_id"),
					name: user.name.as("mention_user_name"),
					email: user.email.as("mention_user_email"),
					image: user.image.as("mention_user_image"),
				},
			})
			.from(commentMentions)
			.innerJoin(user, eq(user.id, commentMentions.userId))
			.where(inArray(commentMentions.commentId, commentIds));
	},
});

export const commentMentionInsertStatement = (
	db: Database,
	rows: { commentId: string; userId: string }[],
): BatchItem<"sqlite"> =>
	db.insert(commentMentions).values(rows).onConflictDoNothing();

/** Clears one comment's mentions; used when an edit rewrites the body. */
export const commentMentionDeleteStatement = (
	db: Database,
	commentId: string,
): BatchItem<"sqlite"> =>
	db.delete(commentMentions).where(eq(commentMentions.commentId, commentId));

export type CommentMentionDao = ReturnType<typeof createCommentMentionDao>;
