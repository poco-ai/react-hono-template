import { and, asc, count, eq, inArray, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { user } from "../db/auth-schema";
import {
	attachments,
	commentMentions,
	commentReactions,
	comments,
	notifications,
} from "../db/schema";
import type { Database } from "../db/types";
import type { CommentDto, ListCommentsDto } from "../dto/comment.dto";
import { type ActivityInsert, activityInsertStatement } from "./activity.dao";
import {
	commentMentionDeleteStatement,
	commentMentionInsertStatements,
} from "./comment-mention.dao";

// D1 batch rows are keyed by column name, so joined columns colliding with
// comments columns (e.g. both tables have "id") shift values. Alias the user
// columns to unique names — see drizzle-orm#6038.
const COMMENT_SELECT = {
	id: comments.id,
	orgId: comments.orgId,
	issueId: comments.issueId,
	parentId: comments.parentId,
	body: comments.body,
	createdAt: comments.createdAt,
	updatedAt: comments.updatedAt,
	resolvedAt: comments.resolvedAt,
	resolvedById: comments.resolvedById,
	author: {
		id: user.id.as("author_user_id"),
		name: user.name.as("author_user_name"),
		email: user.email.as("author_user_email"),
		image: user.image.as("author_user_image"),
	},
};

const toCommentDto = (row: {
	id: string;
	orgId: string;
	issueId: string;
	parentId: string | null;
	body: string;
	createdAt: Date;
	updatedAt: Date;
	resolvedAt: Date | null;
	resolvedById: string | null;
	author: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	};
}): CommentDto => ({
	...row,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
	resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
	attachments: [],
	reactions: [],
	mentions: [],
});

export const createCommentDao = (db: Database) => ({
	listByIssue: async (
		orgId: string,
		issueId: string,
		page: number,
		pageSize: number,
	): Promise<ListCommentsDto> => {
		const where = and(eq(comments.orgId, orgId), eq(comments.issueId, issueId));
		const [rows, totals] = await db.batch([
			db
				.select(COMMENT_SELECT)
				.from(comments)
				.innerJoin(user, eq(user.id, comments.authorId))
				.where(where)
				.orderBy(asc(comments.createdAt), asc(comments.id))
				.limit(pageSize)
				.offset((page - 1) * pageSize),
			db.select({ value: count() }).from(comments).where(where),
		]);
		return {
			items: rows.map(toCommentDto),
			total: totals[0]?.value ?? 0,
			page,
			pageSize,
		};
	},

	create: async (
		data: {
			id: string;
			orgId: string;
			issueId: string;
			authorId: string;
			body: string;
			parentId?: string | null;
		},
		activity?: ActivityInsert,
		mentions?: { commentId: string; userId: string }[],
	): Promise<CommentDto> => {
		const statements = [db.insert(comments).values(data)] as [
			BatchItem<"sqlite">,
			...BatchItem<"sqlite">[],
		];
		if (activity) {
			statements.push(activityInsertStatement(db, [activity]));
		}
		if (mentions && mentions.length > 0) {
			statements.push(...commentMentionInsertStatements(db, mentions));
		}
		await db.batch(statements);
		const created = await db
			.select(COMMENT_SELECT)
			.from(comments)
			.innerJoin(user, eq(user.id, comments.authorId))
			.where(and(eq(comments.orgId, data.orgId), eq(comments.id, data.id)))
			.get();
		if (!created) {
			throw new Error(`Comment ${data.id} not found after insert`);
		}
		return toCommentDto(created);
	},

	findById: async (orgId: string, id: string): Promise<CommentDto | null> => {
		const row = await db
			.select(COMMENT_SELECT)
			.from(comments)
			.innerJoin(user, eq(user.id, comments.authorId))
			.where(and(eq(comments.orgId, orgId), eq(comments.id, id)))
			.get();
		return row ? toCommentDto(row) : null;
	},

	/**
	 * Rewrites the body and, in the same batch, replaces the mention rows so
	 * the stored mentions always match the current text.
	 */
	update: async (
		orgId: string,
		id: string,
		body: string,
		mentions?: { commentId: string; userId: string }[],
	): Promise<CommentDto | null> => {
		const statements = [
			db
				.update(comments)
				.set({ body })
				.where(and(eq(comments.orgId, orgId), eq(comments.id, id)))
				.returning({ id: comments.id }),
			commentMentionDeleteStatement(db, id),
		] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
		if (mentions && mentions.length > 0) {
			statements.push(...commentMentionInsertStatements(db, mentions));
		}
		const [rows] = (await db.batch(statements)) as [{ id: string }[]];
		if (rows.length === 0) {
			return null;
		}
		const row = await db
			.select(COMMENT_SELECT)
			.from(comments)
			.innerJoin(user, eq(user.id, comments.authorId))
			.where(and(eq(comments.orgId, orgId), eq(comments.id, id)))
			.get();
		return row ? toCommentDto(row) : null;
	},

	/**
	 * Deletes the comment, its one-level replies and every dependent row
	 * (reactions, mentions, attachments, notification back-references) in one
	 * batch. The FKs would cascade in theory, but D1 does not always enforce
	 * foreign keys, so the child deletes are explicit — no orphan rows and no
	 * quota rows that outlive their comment. Storage objects are the caller's
	 * concern and must be removed only after this commit succeeds.
	 */
	delete: async (orgId: string, id: string): Promise<boolean> => {
		const replyIds = db
			.select({ id: comments.id })
			.from(comments)
			.where(and(eq(comments.orgId, orgId), eq(comments.parentId, id)));
		const threadComment = (column: AnySQLiteColumn) =>
			or(eq(column, id), inArray(column, replyIds));
		const results = await db.batch([
			db
				.delete(commentReactions)
				.where(threadComment(commentReactions.commentId)),
			db
				.delete(commentMentions)
				.where(threadComment(commentMentions.commentId)),
			db
				.delete(attachments)
				.where(
					and(
						eq(attachments.orgId, orgId),
						threadComment(attachments.commentId),
					),
				),
			db
				.update(notifications)
				.set({ commentId: null })
				.where(threadComment(notifications.commentId)),
			db
				.delete(comments)
				.where(and(eq(comments.orgId, orgId), threadComment(comments.id)))
				.returning({ id: comments.id }),
		]);
		const deleted = results[4] as { id: string }[];
		return deleted.some((row) => row.id === id);
	},

	setResolution: async (
		orgId: string,
		id: string,
		resolvedAt: Date | null,
		resolvedById: string | null,
		activity?: ActivityInsert,
	): Promise<boolean> => {
		const statements = [
			db
				.update(comments)
				.set({ resolvedAt, resolvedById })
				.where(and(eq(comments.orgId, orgId), eq(comments.id, id)))
				.returning({ id: comments.id }),
		] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
		if (activity) {
			statements.push(activityInsertStatement(db, [activity]));
		}
		const [rows] = (await db.batch(statements)) as [{ id: string }[], unknown?];
		return (rows?.length ?? 0) > 0;
	},
});

export type CommentDao = ReturnType<typeof createCommentDao>;
