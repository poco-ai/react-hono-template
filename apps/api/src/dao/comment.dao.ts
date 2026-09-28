import { and, asc, count, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { user } from "../db/auth-schema";
import { activities, comments } from "../db/schema";
import type { Database } from "../db/types";
import type { CommentDto, ListCommentsDto } from "../dto/comment.dto";
import type { ActivityInsert } from "./activity.dao";

const COMMENT_SELECT = {
	id: comments.id,
	orgId: comments.orgId,
	issueId: comments.issueId,
	body: comments.body,
	createdAt: comments.createdAt,
	updatedAt: comments.updatedAt,
	author: {
		id: user.id,
		name: user.name,
		email: user.email,
		image: user.image,
	},
};

const toCommentDto = (row: {
	id: string;
	orgId: string;
	issueId: string;
	body: string;
	createdAt: Date;
	updatedAt: Date;
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
		},
		activity?: ActivityInsert,
	): Promise<CommentDto> => {
		const statements = [db.insert(comments).values(data)] as [
			BatchItem<"sqlite">,
			...BatchItem<"sqlite">[],
		];
		if (activity) {
			statements.push(db.insert(activities).values(activity));
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

	update: async (
		orgId: string,
		id: string,
		body: string,
	): Promise<CommentDto | null> => {
		const rows = await db
			.update(comments)
			.set({ body })
			.where(and(eq(comments.orgId, orgId), eq(comments.id, id)))
			.returning({ id: comments.id });
		if (rows.length === 0) {
			return null;
		}
		return await db
			.select(COMMENT_SELECT)
			.from(comments)
			.innerJoin(user, eq(user.id, comments.authorId))
			.where(and(eq(comments.orgId, orgId), eq(comments.id, id)))
			.get()
			.then((row) => (row ? toCommentDto(row) : null));
	},

	delete: async (orgId: string, id: string): Promise<boolean> => {
		const rows = await db
			.delete(comments)
			.where(and(eq(comments.orgId, orgId), eq(comments.id, id)))
			.returning({ id: comments.id });
		return rows.length > 0;
	},
});

export type CommentDao = ReturnType<typeof createCommentDao>;
