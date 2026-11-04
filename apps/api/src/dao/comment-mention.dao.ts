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

/**
 * D1 caps bound parameters per statement (~100). A mention row binds 2
 * columns, so 25 rows (50 params) stay safely under the limit while the
 * chunks still ride in the caller's single `db.batch` transaction.
 */
export const COMMENT_MENTION_INSERT_CHUNK = 25;

export const commentMentionInsertStatements = (
	db: Database,
	rows: { commentId: string; userId: string }[],
): BatchItem<"sqlite">[] => {
	const statements: BatchItem<"sqlite">[] = [];
	for (
		let start = 0;
		start < rows.length;
		start += COMMENT_MENTION_INSERT_CHUNK
	) {
		statements.push(
			db
				.insert(commentMentions)
				.values(rows.slice(start, start + COMMENT_MENTION_INSERT_CHUNK))
				.onConflictDoNothing(),
		);
	}
	return statements;
};

/** Clears one comment's mentions; used when an edit rewrites the body. */
export const commentMentionDeleteStatement = (
	db: Database,
	commentId: string,
): BatchItem<"sqlite"> =>
	db.delete(commentMentions).where(eq(commentMentions.commentId, commentId));

export type CommentMentionDao = ReturnType<typeof createCommentMentionDao>;
