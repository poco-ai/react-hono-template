import { ApiError, ApiErrorCode, PLANS } from "@workspace/shared";
import {
	convertToModelMessages,
	isTextUIPart,
	type LanguageModelUsage,
	stepCountIs,
	streamText,
	type UIMessage,
} from "ai";
import type { OrganizationDao } from "../../../core/dao/organization.dao";
import type { BackgroundFn } from "../../../core/lib/background";
import { sha256Hex } from "../../../core/lib/crypto";
import type { AiQuotaGuard } from "../../../core/lib/ports/quota";
import type { PlanService } from "../../../core/services/plan.service";
import type { CapabilityExecutor } from "../../capabilities/executor";
import type { CapabilityContext } from "../../capabilities/types";
import { dropUnverifiedToolParts, verifyApprovalResponses } from "../approvals";
import type { AiContextDaos, AiContextRequest } from "../context";
import { resolveAiContext } from "../context";
import type { AiMessageDao } from "../dao/ai-message.dao";
import type { AiToolCallDao } from "../dao/ai-tool-call.dao";
import type { AiContextType, AiToolCallStatus } from "../dto/ai.dto";
import { buildSystemPrompt } from "../prompt";
import type { AiProvider, AiProviderInfo } from "../provider";
import { buildChatTools } from "../tools";
import type { AiConversationService } from "./ai-conversation.service";
import { type AiUsageService, estimateTokens } from "./ai-usage.service";
import type { OrgAiSettingsService } from "./org-ai-settings.service";

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
	quota,
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
	quota?: AiQuotaGuard;
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
				ApiErrorCode.AI_MESSAGE_INVALID,
				"Chat messages are not valid UI messages.",
			);
		}

		const settings = await settingsService.get(orgId);
		const providerInfo = provider.info;
		if (!providerInfo.enabled || !settings.enabled) {
			throw new ApiError(
				ApiErrorCode.AI_DISABLED,
				"AI is disabled for this organization.",
			);
		}
		if (!providerInfo.configured) {
			throw new ApiError(
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
		const assistantId = crypto.randomUUID();
		const reservationKey = `ai:${assistantId}`;
		if (quota) {
			await quota.authorize({
				orgId,
				meter: "ai.tokens",
				quantity: estimatedInputTokens + maxOutputTokens,
				idempotencyKey: reservationKey,
				actor: { actorType: "user", actorId: userId },
				dimensions: { surface: "chat", conversationId },
			});
		} else {
			await usageService.assertWithinQuota(
				orgId,
				plan,
				estimatedInputTokens + maxOutputTokens,
			);
		}

		const reservation = { orgId, idempotencyKey: reservationKey };
		let finalizationStarted = false;
		const finalizeReservation = async (finalize: () => Promise<void>) => {
			if (finalizationStarted) return;
			finalizationStarted = true;
			await finalize();
		};
		const releaseReservation = async () => {
			if (!quota) return;
			try {
				await finalizeReservation(() => quota.release(reservation));
			} catch (error) {
				// Do not replace the original chat error with a cleanup failure.
				console.error("[ai] failed to release token reservation:", error);
			}
		};

		const startStream = async () => {
			// Claim approvals only after the request is known to be serviceable.
			const approvals = await verifyApprovalResponses(
				clientMessages,
				toolCallDao,
				orgId,
				conversationId,
			);

			const now = new Date();
			const userMessages = messages.filter(
				(message) => message.role === "user",
			);
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
					createdAt: new Date(
						now.getTime() - (userMessages.length - 1 - index),
					),
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
				throw new ApiError(ApiErrorCode.NOT_FOUND, "Organization not found.");
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
				approvals,
			});

			let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
			try {
				modelMessages = await convertToModelMessages(messages, {
					tools,
					ignoreIncompleteToolCalls: true,
				});
			} catch {
				throw new ApiError(
					ApiErrorCode.AI_MESSAGE_INVALID,
					"Chat messages are not valid UI messages.",
				);
			}

			const planMaxSteps = PLANS[plan].aiMaxSteps;
			const maxSteps = providerInfo.maxSteps
				? Math.min(planMaxSteps, providerInfo.maxSteps)
				: planMaxSteps;
			let finalUsage: LanguageModelUsage | undefined;
			// Continuation UI messages include parts from the submitted history.
			// Only a fresh server-side tool event may create or update an audit row.
			const emittedToolCalls = new Map<
				string,
				{ toolName: string; input: unknown; status: AiToolCallStatus }
			>();

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
				onChunk: ({ chunk }) => {
					if (chunk.type === "tool-approval-request") {
						const { toolCallId, toolName, input } = chunk.toolCall;
						emittedToolCalls.set(toolCallId, {
							toolName,
							input,
							status: "proposed",
						});
					} else if (
						chunk.type === "tool-error" ||
						(chunk.type === "tool-result" && !chunk.preliminary)
					) {
						emittedToolCalls.set(chunk.toolCallId, {
							toolName: chunk.toolName,
							input: chunk.input,
							status: chunk.type === "tool-error" ? "failed" : "succeeded",
						});
					}
				},
				onEnd: (event) => {
					finalUsage = event.usage;
				},
			});

			const persistToolCalls = async (): Promise<void> => {
				for (const [
					id,
					{ toolName, input: toolInput, status },
				] of emittedToolCalls) {
					const capability = capabilityLayer.get(toolName);
					if (!capability) continue;
					try {
						await toolCallDao.upsert({
							id,
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
							errorCode:
								status === "failed" ? ApiErrorCode.AI_TOOL_FAILED : null,
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
					// Release failed streams even if persisting their partial output fails.
					if (outcome.status !== "completed") await releaseReservation();
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

						const toolCalls = [...emittedToolCalls.values()].filter(
							({ toolName, status }) =>
								(status === "succeeded" || status === "failed") &&
								capabilityLayer.get(toolName),
						).length;
						if (quota && status === "complete") {
							try {
								await finalizeReservation(() =>
									quota.settle({
										...reservation,
										actualQuantity: inputTokens + outputTokens,
										aiUsage: { userId, inputTokens, outputTokens, toolCalls },
									}),
								);
							} catch (error) {
								// Settlement can commit before its usage record fails. Do not
								// release on an ambiguous failure or skip message persistence.
								console.error(
									"[ai] failed to settle token reservation:",
									error,
								);
							}
						}

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

						await persistToolCalls();

						if (!quota) {
							await usageService.record({
								orgId,
								userId,
								inputTokens,
								outputTokens,
								toolCalls,
							});
						}
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

		try {
			return await startStream();
		} catch (error) {
			await releaseReservation();
			throw error;
		}
	};

	return {
		chat,
		/**
		 * Aggregate view for the usage panel: the month summary, the plan
		 * limits, provider info and the organization enablement.
		 */
		usageOverview: async (orgId: string) => {
			const [summary, orgSettings] = await Promise.all([
				usageService.monthSummary(orgId, await plans.getPlanForOrg(orgId)),
				settingsService.get(orgId),
			]);
			return {
				...summary,
				provider: provider.info,
				enabled: orgSettings.enabled,
			};
		},

		/** Aggregate view for the settings panel (settings + usage + provider). */
		settingsOverview: async (orgId: string) => {
			const [orgSettings, summary] = await Promise.all([
				settingsService.get(orgId),
				usageService.monthSummary(orgId, await plans.getPlanForOrg(orgId)),
			]);
			return {
				settings: orgSettings,
				provider: provider.info,
				usage: summary,
				enabled: orgSettings.enabled,
			};
		},
	};
};

export type AiChatService = ReturnType<typeof createAiChatService>;
