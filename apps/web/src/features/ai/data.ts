import type {
	AiConversationDetailDto,
	AiConversationDto,
	AiConversationListDto,
	AiMessageDto,
	AiUsageSummaryDto,
	OrgAiSettingsDto,
	OrgAiSettingsViewDto,
} from "@api/dto/ai.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	AiContextType,
	CreateAiConversationInput,
	UpdateAiConversationInput,
	UpdateOrgAiSettingsInput,
} from "@workspace/shared";
import { DefaultChatTransport, type UIMessage } from "ai";
import { i18n } from "@/i18n";
import { client, unwrap } from "@/lib/api";
import type { TranslationKey } from "@/lib/errors";
import { type CodedError, codedError, errorCode } from "@/lib/errors";

import type { MutationCallbacks } from "@/lib/mutation-callbacks";

/** Conversations fetched for the panel and the `/ai` list column. */
export const AI_CONVERSATION_PAGE_SIZE = 20;

/** Hard cap accepted by the conversations endpoint. */
export const AI_CONVERSATION_MAX_LIMIT = 50;

/** Messages the detail endpoint returns (newest window). */
export const AI_MESSAGE_DETAIL_LIMIT = 200;

/** Chat context sent with every turn (project or issue the user is viewing). */
export type AiChatContextInput = {
	type: AiContextType;
	id: string;
};

// ---------------------------------------------------------------------------
// Query keys — always under ["orgs", orgId, "ai", ...].
// ---------------------------------------------------------------------------

export const aiRootKey = (orgId: string) => ["orgs", orgId, "ai"] as const;

export const aiConversationsRootKey = (orgId: string) =>
	[...aiRootKey(orgId), "conversations"] as const;

export const aiConversationListKey = (orgId: string) =>
	[...aiConversationsRootKey(orgId), "list"] as const;

export const aiConversationDetailKey = (orgId: string, id: string) =>
	[...aiConversationsRootKey(orgId), "detail", id] as const;

export const aiUsageKey = (orgId: string) =>
	[...aiRootKey(orgId), "usage"] as const;

export const aiSettingsKey = (orgId: string) =>
	[...aiRootKey(orgId), "settings"] as const;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export function listAiConversations(
	orgId: string,
	options: { cursor?: string; search?: string; limit?: number } = {},
): Promise<AiConversationListDto> {
	return unwrap(
		client.api.orgs[":orgId"].ai.conversations.$get({
			param: { orgId },
			query: {
				limit: String(options.limit ?? AI_CONVERSATION_PAGE_SIZE),
				cursor: options.cursor || undefined,
				search: options.search || undefined,
			},
		}),
	);
}

export function getAiConversation(
	orgId: string,
	id: string,
): Promise<AiConversationDetailDto> {
	return unwrap(
		client.api.orgs[":orgId"].ai.conversations[":id"].$get({
			param: { orgId, id },
		}),
	);
}

export function createAiConversation(
	orgId: string,
	input: CreateAiConversationInput = {},
): Promise<AiConversationDto> {
	return unwrap(
		client.api.orgs[":orgId"].ai.conversations.$post({
			param: { orgId },
			json: input,
		}),
	);
}

export function updateAiConversation(
	orgId: string,
	id: string,
	input: UpdateAiConversationInput,
): Promise<AiConversationDto> {
	return unwrap(
		client.api.orgs[":orgId"].ai.conversations[":id"].$patch({
			param: { orgId, id },
			json: input,
		}),
	);
}

export function deleteAiConversation(
	orgId: string,
	id: string,
): Promise<{ deleted: boolean }> {
	return unwrap(
		client.api.orgs[":orgId"].ai.conversations[":id"].$delete({
			param: { orgId, id },
		}),
	);
}

export function getAiUsage(orgId: string): Promise<AiUsageSummaryDto> {
	return unwrap(client.api.orgs[":orgId"].ai.usage.$get({ param: { orgId } }));
}

export function getAiSettings(orgId: string): Promise<OrgAiSettingsViewDto> {
	return unwrap(
		client.api.orgs[":orgId"].settings.ai.$get({ param: { orgId } }),
	);
}

export function updateAiSettings(
	orgId: string,
	input: UpdateOrgAiSettingsInput,
): Promise<OrgAiSettingsDto> {
	return unwrap(
		client.api.orgs[":orgId"].settings.ai.$patch({
			param: { orgId },
			json: input,
		}),
	);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function aiConversationListQuery(orgId: string) {
	return queryOptions({
		queryKey: aiConversationListKey(orgId),
		queryFn: () =>
			listAiConversations(orgId, { limit: AI_CONVERSATION_MAX_LIMIT }),
	});
}

export function aiConversationDetailQuery(orgId: string, id: string) {
	return queryOptions({
		queryKey: aiConversationDetailKey(orgId, id),
		queryFn: () => getAiConversation(orgId, id),
	});
}

export function aiUsageQuery(orgId: string) {
	return queryOptions({
		queryKey: aiUsageKey(orgId),
		queryFn: () => getAiUsage(orgId),
	});
}

export function aiSettingsQuery(orgId: string) {
	return queryOptions({
		queryKey: aiSettingsKey(orgId),
		queryFn: () => getAiSettings(orgId),
	});
}

export function useAiConversationList(orgId: string) {
	return useQuery(aiConversationListQuery(orgId));
}

export function useAiUsage(orgId: string) {
	return useQuery(aiUsageQuery(orgId));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateAiConversation(
	orgId: string,
	callbacks?: MutationCallbacks<AiConversationDto, CreateAiConversationInput>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: CreateAiConversationInput) =>
			createAiConversation(orgId, input),
		onSuccess: (...args) => {
			void invalidateAiConversationQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useUpdateAiConversation(
	orgId: string,
	callbacks?: MutationCallbacks<
		AiConversationDto,
		{ id: string; input: UpdateAiConversationInput }
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: ({
			id,
			input,
		}: {
			id: string;
			input: UpdateAiConversationInput;
		}) => updateAiConversation(orgId, id, input),
		onSuccess: (...args) => {
			void invalidateAiConversationQueries(queryClient, orgId, args[1].id);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useUpdateAiSettings(
	orgId: string,
	callbacks?: MutationCallbacks<OrgAiSettingsDto, UpdateOrgAiSettingsInput>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: UpdateOrgAiSettingsInput) =>
			updateAiSettings(orgId, input),
		onSuccess: (...args) => {
			void queryClient.invalidateQueries({ queryKey: aiSettingsKey(orgId) });
			void queryClient.invalidateQueries({ queryKey: aiUsageKey(orgId) });
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useDeleteAiConversation(
	orgId: string,
	callbacks?: MutationCallbacks<{ deleted: boolean }, string>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (id: string) => deleteAiConversation(orgId, id),
		onSuccess: (...args) => {
			void invalidateAiConversationQueries(queryClient, orgId, args[1]);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

// ---------------------------------------------------------------------------
// Cache invalidation
// ---------------------------------------------------------------------------

/** Refresh conversation lists, the given detail and usage after a chat turn. */
export function invalidateAiConversationQueries(
	queryClient: QueryClient,
	orgId: string,
	conversationId?: string,
): Promise<unknown[]> {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: aiConversationsRootKey(orgId),
		}),
		queryClient.invalidateQueries({ queryKey: aiUsageKey(orgId) }),
		...(conversationId
			? [
					queryClient.invalidateQueries({
						queryKey: aiConversationDetailKey(orgId, conversationId),
					}),
				]
			: []),
	]);
}

// ---------------------------------------------------------------------------
// Chat transport / message mapping
// ---------------------------------------------------------------------------

/** Transport for the AI SDK `useChat` hook; the API streams UIMessage chunks. */
export function createAiChatTransport({
	orgId,
	conversationId,
	context,
	timezone,
}: {
	orgId: string;
	conversationId: string;
	context?: AiChatContextInput | null;
	timezone?: string;
}) {
	return new DefaultChatTransport<UIMessage>({
		api: `${import.meta.env?.VITE_API_URL ?? ""}/api/orgs/${orgId}/ai/chat`,
		credentials: "include",
		body: () => ({
			conversationId,
			...(context ? { context } : {}),
			...(timezone ? { timezone } : {}),
		}),
		headers: () => ({
			"Accept-Language": i18n.language.toLowerCase().startsWith("zh")
				? "zh"
				: "en",
		}),
	});
}

/** Persisted API message (parts are opaque to the server) to AI SDK message. */
export function toUIMessage(message: AiMessageDto): UIMessage {
	return {
		id: message.id,
		role: message.role as UIMessage["role"],
		parts: message.parts as UIMessage["parts"],
	};
}

// ---------------------------------------------------------------------------
// AI error helpers (HTTP failures arrive as APICallError with a JSON body)
// ---------------------------------------------------------------------------

export const AI_UNAVAILABLE_CODES = ["AI_DISABLED", "AI_NOT_CONFIGURED"];

const responseEnvelopeCode = (error: unknown): string | undefined => {
	if (typeof error !== "object" || error === null) {
		return undefined;
	}
	const responseBody = (error as { responseBody?: unknown }).responseBody;
	if (typeof responseBody !== "string" || responseBody.length === 0) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(responseBody) as {
			ok?: boolean;
			error?: { code?: unknown };
		};
		const code = parsed.error?.code;
		return typeof code === "string" && code.length > 0 ? code : undefined;
	} catch {
		return undefined;
	}
};

/**
 * Stable AI error code for query errors (which carry `code`) and chat stream
 * errors (APICallError whose `responseBody` is the API error envelope).
 */
export function aiErrorCode(error: unknown): string | undefined {
	return errorCode(error) ?? responseEnvelopeCode(error);
}

export function isAiUnavailableError(error: unknown): boolean {
	const code = aiErrorCode(error);
	return code !== undefined && AI_UNAVAILABLE_CODES.includes(code);
}

/** Builds a coded error for client-side AI failures without an API code. */
export const aiCodedError = (message: string, code?: string): CodedError =>
	codedError(message, code);

// ---------------------------------------------------------------------------
// Tool metadata (names are snake_case capability ids from the API)
// ---------------------------------------------------------------------------

export type AiToolEffect = "read" | "write" | "destructive";

export function aiToolEffect(toolName: string): AiToolEffect {
	if (toolName.startsWith("delete_")) {
		return "destructive";
	}
	if (toolName.startsWith("create_") || toolName.startsWith("update_")) {
		return "write";
	}
	return "read";
}

export const AI_TOOL_TITLE_KEYS: Record<string, TranslationKey> = {
	list_orgs: "ai.capabilities.list_orgs.title",
	get_org: "ai.capabilities.get_org.title",
	list_members: "ai.capabilities.list_members.title",
	list_projects: "ai.capabilities.list_projects.title",
	get_project: "ai.capabilities.get_project.title",
	list_issues: "ai.capabilities.list_issues.title",
	search_issues: "ai.capabilities.search_issues.title",
	search_all: "ai.capabilities.search_all.title",
	get_issue: "ai.capabilities.get_issue.title",
	list_issue_relations: "ai.capabilities.list_issue_relations.title",
	link_issues: "ai.capabilities.link_issues.title",
	unlink_issue: "ai.capabilities.unlink_issue.title",
	list_comments: "ai.capabilities.list_comments.title",
	list_labels: "ai.capabilities.list_labels.title",
	list_statuses: "ai.capabilities.list_statuses.title",
	list_views: "ai.capabilities.list_views.title",
	get_issue_activity: "ai.capabilities.get_issue_activity.title",
	get_org_activity: "ai.capabilities.get_org_activity.title",
	list_cycles: "ai.capabilities.list_cycles.title",
	list_project_updates: "ai.capabilities.list_project_updates.title",
	create_issue: "ai.capabilities.create_issue.title",
	update_issue: "ai.capabilities.update_issue.title",
	delete_issue: "ai.capabilities.delete_issue.title",
	create_comment: "ai.capabilities.create_comment.title",
	update_comment: "ai.capabilities.update_comment.title",
	delete_comment: "ai.capabilities.delete_comment.title",
	resolve_comment: "ai.capabilities.resolve_comment.title",
	toggle_comment_reaction: "ai.capabilities.toggle_comment_reaction.title",
	create_project: "ai.capabilities.create_project.title",
	create_label: "ai.capabilities.create_label.title",
	update_label: "ai.capabilities.update_label.title",
	delete_label: "ai.capabilities.delete_label.title",
	create_view: "ai.capabilities.create_view.title",
	create_cycle: "ai.capabilities.create_cycle.title",
	create_project_update: "ai.capabilities.create_project_update.title",
	list_favorites: "ai.capabilities.list_favorites.title",
	list_issue_templates: "ai.capabilities.list_issue_templates.title",
	list_recurrences: "ai.capabilities.list_recurrences.title",
	create_recurrence: "ai.capabilities.create_recurrence.title",
};

export const aiToolTitleKey = (toolName: string): TranslationKey | undefined =>
	AI_TOOL_TITLE_KEYS[toolName];

export const AI_LINK_LABEL_KEYS: Record<string, TranslationKey> = {
	"ai.links.issue": "ai.links.issue",
	"ai.links.project": "ai.links.project",
	"ai.links.org": "ai.links.org",
	"ai.links.labels": "ai.links.labels",
	"ai.links.statuses": "ai.links.statuses",
};

export const aiLinkLabelKey = (labelKey: string): TranslationKey | undefined =>
	AI_LINK_LABEL_KEYS[labelKey];

/** Browser timezone sent with chat turns so the model can render local dates. */
export function aiTimezone(): string | undefined {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return undefined;
	}
}
