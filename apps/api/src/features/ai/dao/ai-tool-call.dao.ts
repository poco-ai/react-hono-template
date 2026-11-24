import { and, desc, eq, sql } from "drizzle-orm";
import { aiToolCalls } from "../../../db/schema";
import type { Database } from "../../../db/types";
import type { CapabilityEffect } from "../../capabilities/types";
import type { AiToolCallDto, AiToolCallStatus } from "../dto/ai.dto";

type ToolCallRow = typeof aiToolCalls.$inferSelect;

export type AiToolCallUpsert = {
	id: string;
	orgId: string;
	userId: string;
	conversationId: string;
	surface: string;
	toolName: string;
	effect: CapabilityEffect;
	status: AiToolCallStatus;
	inputHash?: string | null;
	inputSummary?: string | null;
	idempotencyKey?: string | null;
	errorCode?: string | null;
	durationMs?: number | null;
};

/**
 * Standalone tool-call record (no conversation), used by surfaces outside the
 * chat runtime such as MCP. `userId` is optional because API keys may have
 * been created without an owning user.
 */
export type AiToolCallRecord = {
	id: string;
	orgId: string;
	userId?: string | null;
	conversationId?: string | null;
	surface: string;
	toolName: string;
	effect: CapabilityEffect;
	status: AiToolCallStatus;
	inputHash?: string | null;
	inputSummary?: string | null;
	errorCode?: string | null;
	durationMs?: number | null;
};

const toDto = (row: ToolCallRow): AiToolCallDto => ({
	id: row.id,
	orgId: row.orgId,
	userId: row.userId,
	conversationId: row.conversationId,
	surface: row.surface,
	toolName: row.toolName,
	effect: row.effect as CapabilityEffect,
	status: row.status as AiToolCallStatus,
	inputHash: row.inputHash,
	inputSummary: row.inputSummary,
	idempotencyKey: row.idempotencyKey,
	errorCode: row.errorCode,
	durationMs: row.durationMs,
	createdAt: row.createdAt.toISOString(),
});

export const createAiToolCallDao = (db: Database) => ({
	upsert: async (data: AiToolCallUpsert): Promise<void> => {
		await db
			.insert(aiToolCalls)
			.values({
				...data,
				inputHash: data.inputHash ?? null,
				inputSummary: data.inputSummary ?? null,
				idempotencyKey: data.idempotencyKey ?? null,
				errorCode: data.errorCode ?? null,
				durationMs: data.durationMs ?? null,
			})
			.onConflictDoUpdate({
				target: aiToolCalls.id,
				set: {
					status: data.status,
					inputHash: data.inputHash ?? null,
					inputSummary: data.inputSummary ?? null,
					errorCode: data.errorCode ?? null,
					durationMs: data.durationMs ?? null,
				},
				// Tool call ids are provider-generated; never update a row that
				// belongs to another organization or conversation. Terminal
				// outcomes also win over a concurrent loser's late write.
				where: and(
					eq(aiToolCalls.orgId, data.orgId),
					eq(aiToolCalls.conversationId, data.conversationId),
					sql`not (${aiToolCalls.status} in ('approved', 'succeeded') and ${data.status} = 'rejected')`,
					sql`not (${aiToolCalls.status} = 'succeeded' and ${data.status} != 'succeeded')`,
				),
			});
	},

	/**
	 * Records a tool call from a non-conversation surface (MCP). Unlike
	 * `upsert`, this accepts a null user/conversation and never updates an
	 * existing row.
	 */
	record: async (data: AiToolCallRecord): Promise<void> => {
		await db.insert(aiToolCalls).values({
			id: data.id,
			orgId: data.orgId,
			userId: data.userId ?? null,
			conversationId: data.conversationId ?? null,
			surface: data.surface,
			toolName: data.toolName,
			effect: data.effect,
			status: data.status,
			inputHash: data.inputHash ?? null,
			inputSummary: data.inputSummary ?? null,
			idempotencyKey: null,
			errorCode: data.errorCode ?? null,
			durationMs: data.durationMs ?? null,
		});
	},

	findForConversation: async (
		orgId: string,
		conversationId: string,
		id: string,
	): Promise<AiToolCallDto | null> => {
		const [row] = await db
			.select()
			.from(aiToolCalls)
			.where(
				and(
					eq(aiToolCalls.orgId, orgId),
					eq(aiToolCalls.conversationId, conversationId),
					eq(aiToolCalls.id, id),
				),
			)
			.limit(1);
		return row ? toDto(row) : null;
	},

	listProposed: async (
		orgId: string,
		conversationId: string,
	): Promise<AiToolCallDto[]> => {
		const rows = await db
			.select()
			.from(aiToolCalls)
			.where(
				and(
					eq(aiToolCalls.orgId, orgId),
					eq(aiToolCalls.conversationId, conversationId),
					eq(aiToolCalls.status, "proposed"),
				),
			)
			.orderBy(desc(aiToolCalls.createdAt));
		return rows.map(toDto);
	},

	/**
	 * Compare-and-set the proposal status. Returns false when another request
	 * already claimed it, which is how concurrent approval replays are kept to
	 * a single execution.
	 */
	claimProposedStatus: async (
		orgId: string,
		conversationId: string,
		id: string,
		status: AiToolCallStatus,
		errorCode?: string | null,
	): Promise<boolean> => {
		const rows = await db
			.update(aiToolCalls)
			.set({ status, errorCode: errorCode ?? null })
			.where(
				and(
					eq(aiToolCalls.orgId, orgId),
					eq(aiToolCalls.conversationId, conversationId),
					eq(aiToolCalls.id, id),
					eq(aiToolCalls.status, "proposed"),
				),
			)
			.returning({ id: aiToolCalls.id });
		return rows.length > 0;
	},
});

export type AiToolCallDao = ReturnType<typeof createAiToolCallDao>;
