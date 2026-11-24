import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { sqlNow } from "../../../core/lib/sql-dialect";
import { runBatch } from "../../../db/run-batch";
import { commentReactions } from "../../../db/schema";
import { sqlProfile } from "../../../db/sql-profile";
import type { Database } from "../../../db/types";

export type CommentReactionRow = {
	commentId: string;
	userId: string;
	emoji: string;
};

const toggleOnPostgres = async (
	db: Database,
	where: SQL | undefined,
	row: CommentReactionRow,
) => {
	const transactional = db as Database & {
		transaction: <T>(fn: (tx: Database) => Promise<T>) => Promise<T>;
	};
	return transactional.transaction(async (tx) => {
		const deleted = await tx
			.delete(commentReactions)
			.where(where)
			.returning({ commentId: commentReactions.commentId });
		if (deleted.length > 0) return false;
		await tx
			.insert(commentReactions)
			.values({
				...row,
				createdAt: new Date(),
			})
			// A concurrent insert leaves the reaction enabled without aborting
			// the PostgreSQL transaction on a unique violation.
			.onConflictDoNothing({
				target: [
					commentReactions.commentId,
					commentReactions.userId,
					commentReactions.emoji,
				],
			});
		return true;
	});
};

const toggleOnSqlite = async (
	db: Database,
	where: SQL | undefined,
	row: CommentReactionRow,
) => {
	const results = await runBatch(
		db,
		(tx) =>
			[
				tx.delete(commentReactions).where(where),
				tx.insert(commentReactions).select(
					sql`SELECT ${row.commentId}, ${row.userId}, ${row.emoji},
						${sqlNow()}
						WHERE (SELECT changes()) = 0`,
				),
			] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
	);
	const inserted = results[1] as unknown[];
	return inserted.length > 0;
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
	 * Toggles one (comment, user, emoji) row.
	 * SQLite has no interactive transaction, so DELETE and a conditional INSERT
	 * share one batch and `changes()` decides whether the insert runs.
	 * PostgreSQL deletes inside a transaction and inserts only when nothing was
	 * removed. A unique conflict means a concurrent toggle already turned it on.
	 */
	toggle: async (
		commentId: string,
		userId: string,
		emoji: string,
	): Promise<boolean> => {
		const where = and(
			eq(commentReactions.commentId, commentId),
			eq(commentReactions.userId, userId),
			eq(commentReactions.emoji, emoji),
		);
		const row = { commentId, userId, emoji };
		return sqlProfile().dialect === "postgres"
			? toggleOnPostgres(db, where, row)
			: toggleOnSqlite(db, where, row);
	},
});

export type CommentReactionDao = ReturnType<typeof createCommentReactionDao>;
