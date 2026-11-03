import { and, desc, eq, isNull, like, or, type SQL, sql } from "drizzle-orm";
import { aiConversations } from "../db/schema";
import type { Database } from "../db/types";
import type { AiConversationDto } from "../dto/ai.dto";

type ConversationRow = typeof aiConversations.$inferSelect;

export type AiConversationCursor = {
	pinned: boolean;
	activityAt: number;
	id: string;
};

const toDto = (row: ConversationRow): AiConversationDto => ({
	id: row.id,
	orgId: row.orgId,
	userId: row.userId,
	title: row.title,
	contextType: row.contextType,
	contextId: row.contextId,
	pinned: row.pinned,
	model: row.model,
	lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});

const activityAt = sql<number>`coalesce(${aiConversations.lastMessageAt}, ${aiConversations.createdAt})`;

const cursorCondition = (cursor: AiConversationCursor): SQL => sql`
	(${aiConversations.pinned} < ${cursor.pinned ? 1 : 0})
	or (
		${aiConversations.pinned} = ${cursor.pinned ? 1 : 0}
		and (
			${activityAt} < ${cursor.activityAt}
			or (${activityAt} = ${cursor.activityAt} and ${aiConversations.id} < ${cursor.id})
		)
	)
`;

export const createAiConversationDao = (db: Database) => ({
	create: async (data: {
		id: string;
		orgId: string;
		userId: string;
		title: string | null;
		contextType: string | null;
		contextId: string | null;
		model?: string | null;
	}): Promise<AiConversationDto> => {
		const row = await db.insert(aiConversations).values(data).returning().get();
		return toDto(row);
	},

	/** Owner-scoped lookup. Deleted conversations are invisible. */
	findById: async (
		orgId: string,
		userId: string,
		id: string,
	): Promise<AiConversationDto | null> => {
		const row = await db
			.select()
			.from(aiConversations)
			.where(
				and(
					eq(aiConversations.orgId, orgId),
					eq(aiConversations.userId, userId),
					eq(aiConversations.id, id),
					isNull(aiConversations.deletedAt),
				),
			)
			.get();
		return row ? toDto(row) : null;
	},

	listByUser: async (
		orgId: string,
		userId: string,
		options: {
			limit: number;
			search?: string;
			cursor?: AiConversationCursor;
		},
	): Promise<{ items: AiConversationDto[]; hasMore: boolean }> => {
		const conditions = [
			eq(aiConversations.orgId, orgId),
			eq(aiConversations.userId, userId),
			isNull(aiConversations.deletedAt),
		];
		if (options.search) {
			conditions.push(like(aiConversations.title, `%${options.search}%`));
		}
		if (options.cursor) {
			conditions.push(cursorCondition(options.cursor));
		}
		const rows = await db
			.select()
			.from(aiConversations)
			.where(and(...conditions))
			.orderBy(
				desc(aiConversations.pinned),
				desc(activityAt),
				desc(aiConversations.id),
			)
			.limit(options.limit + 1)
			.all();
		const hasMore = rows.length > options.limit;
		return {
			items: rows.slice(0, options.limit).map(toDto),
			hasMore,
		};
	},

	update: async (
		orgId: string,
		userId: string,
		id: string,
		patch: { title?: string | null; pinned?: boolean },
	): Promise<AiConversationDto | null> => {
		if (Object.keys(patch).length === 0) {
			return await db
				.select()
				.from(aiConversations)
				.where(
					and(
						eq(aiConversations.orgId, orgId),
						eq(aiConversations.userId, userId),
						eq(aiConversations.id, id),
						isNull(aiConversations.deletedAt),
					),
				)
				.get()
				.then((row) => (row ? toDto(row) : null));
		}
		const rows = await db
			.update(aiConversations)
			.set(patch)
			.where(
				and(
					eq(aiConversations.orgId, orgId),
					eq(aiConversations.userId, userId),
					eq(aiConversations.id, id),
					isNull(aiConversations.deletedAt),
				),
			)
			.returning();
		const row = rows[0];
		return row ? toDto(row) : null;
	},

	/**
	 * Removes conversations older than each organization's retention window.
	 * Messages cascade; tool-call rows keep their audit trail.
	 */
	deleteExpired: async (now = new Date()): Promise<number> => {
		const nowMs = now.getTime();
		const rows = await db
			.delete(aiConversations)
			.where(
				and(
					isNull(aiConversations.deletedAt),
					sql`coalesce(${aiConversations.lastMessageAt}, ${aiConversations.updatedAt}) < ${nowMs} - coalesce((select retention_days from org_ai_settings where org_id = ${aiConversations.orgId}), 30) * 86400000`,
				),
			)
			.returning({ id: aiConversations.id });
		return rows.length;
	},

	softDelete: async (
		orgId: string,
		userId: string,
		id: string,
	): Promise<boolean> => {
		const rows = await db
			.update(aiConversations)
			.set({ deletedAt: new Date() })
			.where(
				and(
					eq(aiConversations.orgId, orgId),
					eq(aiConversations.userId, userId),
					eq(aiConversations.id, id),
					isNull(aiConversations.deletedAt),
				),
			)
			.returning({ id: aiConversations.id });
		return rows.length > 0;
	},

	/** Sets the title only while it is still empty (first user message). */
	setTitleIfEmpty: async (
		orgId: string,
		userId: string,
		id: string,
		title: string,
	): Promise<void> => {
		await db
			.update(aiConversations)
			.set({ title })
			.where(
				and(
					eq(aiConversations.orgId, orgId),
					eq(aiConversations.userId, userId),
					eq(aiConversations.id, id),
					isNull(aiConversations.deletedAt),
					or(isNull(aiConversations.title), eq(aiConversations.title, "")),
				),
			);
	},

	touch: async (
		orgId: string,
		userId: string,
		id: string,
		patch: { lastMessageAt: Date; model?: string | null },
	): Promise<void> => {
		await db
			.update(aiConversations)
			.set(patch)
			.where(
				and(
					eq(aiConversations.orgId, orgId),
					eq(aiConversations.userId, userId),
					eq(aiConversations.id, id),
					isNull(aiConversations.deletedAt),
				),
			);
	},
});

export type AiConversationDao = ReturnType<typeof createAiConversationDao>;
