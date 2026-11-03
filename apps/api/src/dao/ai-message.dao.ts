import { and, desc, eq } from "drizzle-orm";
import { aiMessages } from "../db/schema";
import type { Database } from "../db/types";
import type { AiContextSnapshot, AiMessageDto } from "../dto/ai.dto";

type MessageRow = typeof aiMessages.$inferSelect;

export type AiMessageInsert = {
	id: string;
	conversationId: string;
	orgId: string;
	userId: string;
	role: string;
	parts: unknown[];
	status?: string;
	model?: string | null;
	context?: AiContextSnapshot | null;
	createdAt?: Date;
};

// D1 caps bound parameters per statement (~100); 8 rows × 9 columns stays
// comfortably below it even for long histories.
const INSERT_CHUNK_SIZE = 8;

const toDto = (row: MessageRow): AiMessageDto => ({
	id: row.id,
	conversationId: row.conversationId,
	orgId: row.orgId,
	userId: row.userId,
	role: row.role,
	parts: row.parts,
	status: row.status,
	model: row.model,
	inputTokens: row.inputTokens,
	outputTokens: row.outputTokens,
	context: (row.context as AiContextSnapshot | null) ?? null,
	createdAt: row.createdAt.toISOString(),
});

export const createAiMessageDao = (db: Database) => ({
	/** Idempotent insert used for client-supplied user messages. */
	insertManyIfAbsent: async (rows: AiMessageInsert[]): Promise<void> => {
		for (let start = 0; start < rows.length; start += INSERT_CHUNK_SIZE) {
			await db
				.insert(aiMessages)
				.values(rows.slice(start, start + INSERT_CHUNK_SIZE))
				.onConflictDoNothing();
		}
	},

	/**
	 * Assistant messages can be extended by a follow-up stream (tool approval
	 * continuations), so their row is upserted instead of ignored.
	 */
	upsertAssistant: async (data: {
		id: string;
		conversationId: string;
		orgId: string;
		userId: string;
		parts: unknown[];
		status: string;
		model: string | null;
		inputTokens: number | null;
		outputTokens: number | null;
	}): Promise<void> => {
		await db
			.insert(aiMessages)
			.values({ ...data, role: "assistant" })
			.onConflictDoUpdate({
				target: aiMessages.id,
				set: {
					parts: data.parts,
					status: data.status,
					model: data.model,
					inputTokens: data.inputTokens,
					outputTokens: data.outputTokens,
				},
				// Never let a forged client message id update another
				// conversation's message.
				where: and(
					eq(aiMessages.orgId, data.orgId),
					eq(aiMessages.conversationId, data.conversationId),
				),
			});
	},

	/** Most recent messages, returned oldest-first. */
	listRecent: async (
		orgId: string,
		conversationId: string,
		limit: number,
	): Promise<AiMessageDto[]> => {
		const rows = await db
			.select()
			.from(aiMessages)
			.where(
				and(
					eq(aiMessages.orgId, orgId),
					eq(aiMessages.conversationId, conversationId),
				),
			)
			.orderBy(desc(aiMessages.createdAt), desc(aiMessages.id))
			.limit(limit)
			.all();
		return rows.reverse().map(toDto);
	},
});

export type AiMessageDao = ReturnType<typeof createAiMessageDao>;
