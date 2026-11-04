import {
	type AiConversationListQuery,
	ApiError,
	ApiErrorCode,
	type CreateAiConversationInput,
	type UpdateAiConversationInput,
} from "@workspace/shared";
import {
	type AiContextDaos,
	type AiContextRequest,
	resolveAiContext,
} from "../ai/context";
import type {
	AiConversationCursor,
	AiConversationDao,
} from "../dao/ai-conversation.dao";
import type { AiMessageDao } from "../dao/ai-message.dao";
import type { AiToolCallDao } from "../dao/ai-tool-call.dao";
import type {
	AiConversationDetailDto,
	AiConversationDto,
	AiConversationListDto,
} from "../dto/ai.dto";

const TITLE_MAX_LENGTH = 60;

export const titleFromText = (text: string): string | null => {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return null;
	return normalized.length > TITLE_MAX_LENGTH
		? normalized.slice(0, TITLE_MAX_LENGTH).trimEnd()
		: normalized;
};

const encodeCursor = (conversation: AiConversationDto): string =>
	btoa(
		JSON.stringify([
			conversation.pinned ? 1 : 0,
			new Date(conversation.lastMessageAt ?? conversation.createdAt).getTime(),
			conversation.id,
		]),
	);

const decodeCursor = (raw: string): AiConversationCursor => {
	try {
		const parsed: unknown = JSON.parse(atob(raw));
		if (
			Array.isArray(parsed) &&
			parsed.length === 3 &&
			(parsed[0] === 0 || parsed[0] === 1) &&
			typeof parsed[1] === "number" &&
			Number.isFinite(parsed[1]) &&
			typeof parsed[2] === "string" &&
			parsed[2].length > 0
		) {
			return {
				pinned: parsed[0] === 1,
				activityAt: parsed[1],
				id: parsed[2],
			};
		}
	} catch {
		// fall through to the validation error
	}
	throw new ApiError(
		ApiErrorCode.INVALID_PARAM,
		"Invalid conversation cursor.",
	);
};

const DETAIL_MESSAGE_LIMIT = 200;

export const createAiConversationService = ({
	conversationDao,
	messageDao,
	toolCallDao,
	contextDaos,
}: {
	conversationDao: AiConversationDao;
	messageDao: Pick<AiMessageDao, "listRecent">;
	toolCallDao: Pick<AiToolCallDao, "listProposed">;
	contextDaos: AiContextDaos;
}) => {
	const requireConversation = async (
		orgId: string,
		userId: string,
		id: string,
	): Promise<AiConversationDto> => {
		const conversation = await conversationDao.findById(orgId, userId, id);
		if (!conversation) {
			throw new ApiError(
				ApiErrorCode.AI_CONVERSATION_NOT_FOUND,
				`AI conversation ${id} not found.`,
			);
		}
		return conversation;
	};

	return {
		requireConversation,

		create: async (
			orgId: string,
			userId: string,
			input: CreateAiConversationInput,
		): Promise<AiConversationDto> => {
			const context: AiContextRequest | undefined =
				input.contextType && input.contextId
					? { type: input.contextType, id: input.contextId }
					: undefined;
			const snapshot = await resolveAiContext(orgId, context, contextDaos);
			return conversationDao.create({
				id: crypto.randomUUID(),
				orgId,
				userId,
				title: input.title ?? null,
				contextType: snapshot?.type ?? null,
				contextId: snapshot?.id ?? null,
				model: null,
			});
		},

		list: async (
			orgId: string,
			userId: string,
			query: AiConversationListQuery,
		): Promise<AiConversationListDto> => {
			const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
			const { items, hasMore } = await conversationDao.listByUser(
				orgId,
				userId,
				{
					limit: query.limit,
					search: query.search,
					cursor,
				},
			);
			const last = items[items.length - 1];
			return {
				items,
				nextCursor: hasMore && last ? encodeCursor(last) : null,
			};
		},

		get: (
			orgId: string,
			userId: string,
			id: string,
		): Promise<AiConversationDto> => requireConversation(orgId, userId, id),

		detail: async (
			orgId: string,
			userId: string,
			id: string,
		): Promise<AiConversationDetailDto> => {
			const conversation = await requireConversation(orgId, userId, id);
			const [messages, pendingApprovals] = await Promise.all([
				messageDao.listRecent(orgId, id, DETAIL_MESSAGE_LIMIT),
				toolCallDao.listProposed(orgId, id),
			]);
			return { conversation, messages, pendingApprovals };
		},

		update: async (
			orgId: string,
			userId: string,
			id: string,
			input: UpdateAiConversationInput,
		): Promise<AiConversationDto> => {
			await requireConversation(orgId, userId, id);
			const updated = await conversationDao.update(orgId, userId, id, input);
			if (!updated) {
				throw new ApiError(
					ApiErrorCode.AI_CONVERSATION_NOT_FOUND,
					`AI conversation ${id} not found.`,
				);
			}
			return updated;
		},

		remove: async (
			orgId: string,
			userId: string,
			id: string,
		): Promise<void> => {
			await requireConversation(orgId, userId, id);
			await conversationDao.softDelete(orgId, userId, id);
		},

		setTitleIfEmpty: async (
			orgId: string,
			userId: string,
			id: string,
			text: string,
		): Promise<void> => {
			const title = titleFromText(text);
			if (!title) return;
			await conversationDao.setTitleIfEmpty(orgId, userId, id, title);
		},

		touch: (
			orgId: string,
			userId: string,
			id: string,
			patch: { lastMessageAt: Date; model?: string | null },
		): Promise<void> => conversationDao.touch(orgId, userId, id, patch),
	};
};

export type AiConversationService = ReturnType<
	typeof createAiConversationService
>;
