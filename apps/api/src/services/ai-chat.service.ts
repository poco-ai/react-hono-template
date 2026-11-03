import { ApiError, ApiErrorCode, PLANS } from "@workspace/shared";
import {
	convertToModelMessages,
	getToolName,
	isDynamicToolUIPart,
	isTextUIPart,
	isToolUIPart,
	type LanguageModelUsage,
	stepCountIs,
	streamText,
	type UIMessage,
} from "ai";
import {
	dropUnverifiedToolParts,
	verifyApprovalResponses,
} from "../ai/approvals";
import type { AiContextDaos, AiContextRequest } from "../ai/context";
import { resolveAiContext } from "../ai/context";
import { buildSystemPrompt } from "../ai/prompt";
import type { AiProvider, AiProviderInfo } from "../ai/provider";
import { buildChatTools } from "../ai/tools";
import type { CapabilityExecutor } from "../capabilities/executor";
import type { CapabilityContext } from "../capabilities/types";
import type { AiMessageDao } from "../dao/ai-message.dao";
import type { AiToolCallDao } from "../dao/ai-tool-call.dao";
import type { OrganizationDao } from "../dao/organization.dao";
import type { AiContextType, AiToolCallStatus } from "../dto/ai.dto";
import type { BackgroundFn } from "../lib/background";
import { sha256Hex } from "../lib/crypto";
import type { AiConversationService } from "./ai-conversation.service";
import { type AiUsageService, estimateTokens } from "./ai-usage.service";
import type { OrgAiSettingsService } from "./org-ai-settings.service";
import type { PlanService } from "./plan.service";

const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const INPUT_SUMMARY_LENGTH = 300;

const textOfParts = (parts: UIMessage["parts"]): string =>
	parts
		.map((part) => (isTextUIPart(part) ? part.text : ""))
		.join("\n")
		.trim();

const estimateMessageChars = (messages: UIMessage[]): number =>
	messages.reduce((total, message) => {
		for (const part of message.parts) {
			if (isTextUIPart(part)) {
				total += part.text.length;
			} else if ("input" in part && part.input !== undefined) {
				try {
					total += JSON.stringify(part.input).length;
				} catch {
					// ignore non-serializable inputs in the estimate
				}
			}
		}
		return total;
	}, 0);

const statusOfPart = (part: {
	state?: string;
	approval?: { approved?: boolean };
}): AiToolCallStatus | null => {
	switch (part.state) {
		case "approval-requested":
			return "proposed";
		case "approval-responded":
			return part.approval?.approved === true ? "approved" : "rejected";
		case "output-available":
			return "succeeded";
		case "output-error":
			return "failed";
		case "output-denied":
			return "rejected";
		default:
			return null;
	}
};

const idempotencyKeyOf = (input: unknown): string | null => {
	if (input && typeof input === "object" && "idempotencyKey" in input) {
		const value = (input as { idempotencyKey?: unknown }).idempotencyKey;
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}
	return null;
};

const summarizeInput = (input: unknown): string | null => {
	if (input === undefined) return null;
	try {
		const json = JSON.stringify(input);
		return json.length > INPUT_SUMMARY_LENGTH
			? `${json.slice(0, INPUT_SUMMARY_LENGTH)}…`
			: json;
	} catch {
		return null;
	}
};

const isExecutedState = (state: string | undefined): boolean =>
	state === "output-available" || state === "output-error";

export type AiChatInput = {
	orgId: string;
	userId: string;
	orgRole: string;
	conversationId: string;
	messages: UIMessage[];
	context?: AiContextRequest;
	timezone?: string;
	locale: "en" | "zh";
	background: BackgroundFn;
	abortSignal?: AbortSignal;
};

export const createAiChatService = ({
	conversationService,
	messageDao,
	toolCallDao,
	usageService,
	settingsService,
	capabilityLayer,
	plans,
	organizationDao,
	contextDaos,
	provider,
	webBaseUrl,
}: {
	conversationService: AiConversationService;
	messageDao: AiMessageDao;
	toolCallDao: AiToolCallDao;
	usageService: AiUsageService;
	settingsService: OrgAiSettingsService;
	capabilityLayer: CapabilityExecutor;
	plans: PlanService;
	organizationDao: Pick<OrganizationDao, "findById">;
	contextDaos: AiContextDaos;
	provider: { info: AiProviderInfo; create: () => AiProvider };
	webBaseUrl: string;
}) => {
	const chat = async (input: AiChatInput): Promise<Response> => {
		const { orgId, userId, conversationId } = input;
		const conversation = await conversationService.requireConversation(
			orgId,
			userId,
			conversationId,
		);

		// The system prompt is server-owned; ignore any client system messages.
		const clientMessages = input.messages.filter(
			(message) => message.role === "user" || message.role === "assistant",
		);
		if (clientMessages.length === 0) {
			throw new ApiError(
				400,
				ApiErrorCode.AI_MESSAGE_INVALID,
				"Chat messages are not valid UI messages.",
			);
		}

		const settings = await settingsService.get(orgId);
		const providerInfo = provider.info;
		if (!providerInfo.enabled || !settings.enabled) {
			throw new ApiError(
				403,
				ApiErrorCode.AI_DISABLED,
				"AI is disabled for this organization.",
			);
		}
		if (!providerInfo.configured) {
			throw new ApiError(
				503,
				ApiErrorCode.AI_NOT_CONFIGURED,
				"AI provider is not configured.",
			);
		}
		const providerInstance = provider.create();

		const requestContext: AiContextRequest | undefined =
			input.context?.type && input.context.id
				? input.context
				: conversation.contextType && conversation.contextId
					? {
							type: conversation.contextType as AiContextType,
							id: conversation.contextId,
						}
					: undefined;
		const context = await resolveAiContext(orgId, requestContext, contextDaos);

		await verifyApprovalResponses(
			clientMessages,
			toolCallDao,
			orgId,
			conversationId,
		);
		const messages = await dropUnverifiedToolParts(
			clientMessages,
			toolCallDao,
			orgId,
			conversationId,
		);

		const plan = await plans.getPlanForOrg(orgId);
		const maxOutputTokens =
			providerInfo.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
		const estimatedInputTokens = Math.ceil(estimateMessageChars(messages) / 4);
		await usageService.assertWithinQuota(
			orgId,
			plan,
			estimatedInputTokens + maxOutputTokens,
		);

		const now = new Date();
		const userMessages = messages.filter((message) => message.role === "user");
		const latestUserMessage = userMessages[userMessages.length - 1];
		await messageDao.insertManyIfAbsent(
			userMessages.map((message, index) => ({
				id: message.id,
				conversationId,
				orgId,
				userId,
				role: "user",
				parts: message.parts,
				status: "complete",
				model: null,
				context: message === latestUserMessage ? context : null,
				createdAt: new Date(now.getTime() - (userMessages.length - 1 - index)),
			})),
		);
		if (latestUserMessage) {
			const text = textOfParts(latestUserMessage.parts);
			await conversationService.setTitleIfEmpty(
				orgId,
				userId,
				conversationId,
				text,
			);
		}
		await conversationService.touch(orgId, userId, conversationId, {
			lastMessageAt: now,
		});

		const modelId =
			settings.defaultModel ??
			conversation.model ??
			providerInfo.modelId ??
			null;
		const model = providerInstance.resolveModel(modelId);

		const org = await organizationDao.findById(orgId);
		if (!org) {
			throw new ApiError(
				404,
				ApiErrorCode.NOT_FOUND,
				"Organization not found.",
			);
		}

		const capabilityContext: CapabilityContext = {
			orgId,
			actor: {
				userId,
				surface: "chat",
				scopes: ["read", "write", "admin"],
				role: input.orgRole as CapabilityContext["actor"]["role"],
			},
			canWrite: true,
			locale: input.locale,
			webBaseUrl,
			background: (task) => {
				input.background(async () => {
					await task();
				});
			},
		};
		const tools = buildChatTools({
			capabilities: capabilityLayer.list(),
			layer: capabilityLayer,
			ctx: capabilityContext,
		});

		let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
		try {
			modelMessages = await convertToModelMessages(messages, {
				tools,
				ignoreIncompleteToolCalls: true,
			});
		} catch {
			throw new ApiError(
				400,
				ApiErrorCode.AI_MESSAGE_INVALID,
				"Chat messages are not valid UI messages.",
			);
		}

		const planMaxSteps = PLANS[plan].aiMaxSteps;
		const maxSteps = providerInfo.maxSteps
			? Math.min(planMaxSteps, providerInfo.maxSteps)
			: planMaxSteps;
		const assistantId = crypto.randomUUID();
		let finalUsage: LanguageModelUsage | undefined;

		const result = streamText({
			model,
			system: buildSystemPrompt({
				orgName: org.name,
				role: input.orgRole,
				locale: input.locale,
				timezone: input.timezone,
				context,
				now,
			}),
			messages: modelMessages,
			tools,
			stopWhen: stepCountIs(maxSteps),
			maxOutputTokens: providerInfo.maxOutputTokens ?? undefined,
			abortSignal: input.abortSignal,
			onEnd: (event) => {
				finalUsage = event.usage;
			},
		});

		const persistToolCalls = async (
			responseMessage: UIMessage,
			toolCallCount: { executed: number },
		): Promise<void> => {
			for (const part of responseMessage.parts) {
				if (!isToolUIPart(part) && !isDynamicToolUIPart(part)) continue;
				const capability = capabilityLayer.get(getToolName(part));
				if (!capability) continue;
				const status = statusOfPart(part);
				if (!status) continue;
				if (isExecutedState(part.state)) {
					toolCallCount.executed += 1;
				}
				const toolInput =
					"input" in part ? (part as { input?: unknown }).input : undefined;
				try {
					await toolCallDao.upsert({
						id: part.toolCallId,
						orgId,
						userId,
						conversationId,
						surface: "chat",
						toolName: capability.name,
						effect: capability.effect,
						status,
						inputHash: await sha256Hex(JSON.stringify(toolInput ?? null)),
						inputSummary: summarizeInput(toolInput),
						idempotencyKey: idempotencyKeyOf(toolInput),
						errorCode: status === "failed" ? ApiErrorCode.AI_TOOL_FAILED : null,
					});
				} catch (err) {
					// A duplicate idempotency key must not break the response stream.
					console.error(
						"[ai] failed to persist tool call:",
						err instanceof Error ? err.message : err,
					);
				}
			}
		};

		return result.toUIMessageStreamResponse({
			originalMessages: messages,
			generateMessageId: () => assistantId,
			onError: () => "AI request failed.",
			onEnd: async ({ responseMessage, isAborted, outcome }) => {
				try {
					const usage = finalUsage;
					const messageText = textOfParts(responseMessage.parts);
					const inputTokens =
						usage?.inputTokens && usage.inputTokens > 0
							? usage.inputTokens
							: estimatedInputTokens;
					const outputTokens =
						usage?.outputTokens && usage.outputTokens > 0
							? usage.outputTokens
							: estimateTokens(messageText);
					const status =
						outcome.status === "completed"
							? "complete"
							: isAborted || outcome.status === "aborted"
								? "aborted"
								: "error";

					await messageDao.upsertAssistant({
						id: responseMessage.id || assistantId,
						conversationId,
						orgId,
						userId,
						parts: responseMessage.parts,
						status,
						model: modelId,
						inputTokens,
						outputTokens,
					});

					const toolCallCount = { executed: 0 };
					await persistToolCalls(responseMessage, toolCallCount);

					await usageService.record({
						orgId,
						userId,
						inputTokens,
						outputTokens,
						toolCalls: toolCallCount.executed,
					});
					await conversationService.touch(orgId, userId, conversationId, {
						lastMessageAt: new Date(),
						model: modelId,
					});
				} catch (err) {
					console.error(
						"[ai] failed to persist chat result:",
						err instanceof Error ? err.message : err,
					);
				}
			},
		});
	};

	return { chat };
};

export type AiChatService = ReturnType<typeof createAiChatService>;
