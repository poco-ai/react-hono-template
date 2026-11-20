import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import { isToolUIPart, type UIMessage } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV3 } from "ai/test";
import { z } from "zod";
import { type AiProvider, createAiProvider } from "../src/ai/provider";
import {
	type CapabilityExecutor,
	createCapabilityExecutor,
} from "../src/capabilities/executor";
import type { AiMessageDao } from "../src/dao/ai-message.dao";
import type {
	AiToolCallDao,
	AiToolCallUpsert,
} from "../src/dao/ai-tool-call.dao";
import type { AiUsageDao } from "../src/dao/ai-usage.dao";
import { createAiChatService } from "../src/services/ai-chat.service";
import type { AiConversationService } from "../src/services/ai-conversation.service";
import { createAiUsageService } from "../src/services/ai-usage.service";
import type { OrgAiSettingsService } from "../src/services/org-ai-settings.service";
import type { PlanService } from "../src/services/plan.service";

const ORG_ID = "org-1";
const USER_ID = "user-1";
const CONVERSATION_ID = "conversation-1";
const NOW = "2026-01-01T00:00:00.000Z";

const userMessage: UIMessage = {
	id: "message-1",
	role: "user",
	parts: [{ type: "text", text: "Hello there" }],
};

type ChatQuota = NonNullable<
	Parameters<typeof createAiChatService>[0]["quota"]
>;

const quotaRecorder = (authorizationError?: Error) => {
	const events: { action: string; orgId: string; idempotencyKey: string }[] =
		[];
	const quota: ChatQuota = {
		authorize: async (reservation) => {
			events.push({ ...reservation, action: "authorize" });
			if (authorizationError) throw authorizationError;
			return {} as Awaited<ReturnType<ChatQuota["authorize"]>>;
		},
		settle: async (reservation) => {
			events.push({ ...reservation, action: "settle" });
		},
		release: async (reservation) => {
			events.push({ ...reservation, action: "release" });
		},
	};
	const expectActions = (actions: string[]) => {
		assert.deepEqual(
			events.map((event) => event.action),
			actions,
		);
		assert.ok(events[0]?.idempotencyKey.startsWith("ai:"));
		for (const event of events) {
			assert.equal(event.orgId, ORG_ID);
			assert.equal(event.idempotencyKey, events[0]?.idempotencyKey);
		}
	};
	return { quota, expectActions };
};

const setup = ({
	enabled = true,
	provider = createAiProvider({ AI_ENABLED: "true" }),
	toolCallDao,
	capabilityLayer,
	quota,
	upsertAssistantError,
}: {
	enabled?: boolean;
	provider?: AiProvider;
	toolCallDao?: Partial<AiToolCallDao>;
	capabilityLayer?: CapabilityExecutor;
	quota?: ChatQuota;
	upsertAssistantError?: Error;
} = {}) => {
	const userRows: unknown[] = [];
	let assistantRow: Record<string, unknown> | null = null;
	const usageRows: Record<string, unknown>[] = [];
	const touched: unknown[] = [];
	let title: string | null = null;

	const conversation = {
		id: CONVERSATION_ID,
		orgId: ORG_ID,
		userId: USER_ID,
		title: null,
		contextType: null,
		contextId: null,
		pinned: false,
		model: null,
		lastMessageAt: null,
		createdAt: NOW,
		updatedAt: NOW,
	} as const;

	const service = createAiChatService({
		conversationService: {
			requireConversation: async () => conversation,
			setTitleIfEmpty: async (
				_orgId: string,
				_userId: string,
				_id: string,
				text: string,
			) => {
				title = text;
			},
			touch: async (
				_orgId: string,
				_userId: string,
				_id: string,
				patch: unknown,
			) => {
				touched.push(patch);
			},
		} as unknown as AiConversationService,
		messageDao: {
			insertManyIfAbsent: async (rows: unknown[]) => {
				userRows.push(...rows);
			},
			upsertAssistant: async (row: Record<string, unknown>) => {
				if (upsertAssistantError) throw upsertAssistantError;
				assistantRow = { ...row, role: "assistant" };
			},
		} as unknown as AiMessageDao,
		toolCallDao: {
			findForConversation: async () => null,
			claimProposedStatus: async () => false,
			upsert: async () => undefined,
			listProposed: async () => [],
			...toolCallDao,
		} as unknown as AiToolCallDao,
		usageService: createAiUsageService({
			usageDao: {
				sumBetween: async () => ({
					requests: 0,
					inputTokens: 0,
					outputTokens: 0,
					toolCalls: 0,
				}),
				record: async (row: Record<string, unknown>) => {
					usageRows.push(row);
				},
			} as unknown as AiUsageDao,
		}),
		quota,
		settingsService: {
			get: async () => ({ enabled }),
			isEnabled: async () => enabled,
		} as unknown as OrgAiSettingsService,
		capabilityLayer:
			capabilityLayer ??
			({
				list: () => [],
				get: () => undefined,
				execute: async () => ({ data: {}, summary: "", links: [] }),
			} as unknown as CapabilityExecutor),
		plans: {
			getPlanForOrg: async () => "free",
		} as unknown as PlanService,
		organizationDao: {
			findById: async () => ({ id: ORG_ID, name: "Acme" }),
		} as never,
		contextDaos: {
			projectDao: { findById: async () => null },
			issueDao: { findById: async () => null },
		},
		provider: {
			info: provider.info,
			create: () => provider,
		},
		webBaseUrl: "https://app.example.com",
	});

	return {
		service,
		ask: (messages = [userMessage], abortSignal?: AbortSignal) =>
			service.chat({
				orgId: ORG_ID,
				userId: USER_ID,
				orgRole: "owner",
				conversationId: CONVERSATION_ID,
				messages,
				locale: "en",
				background: () => undefined,
				abortSignal,
			}),
		userRows,
		usageRows,
		touched,
		getAssistantRow: () => assistantRow,
		getTitle: () => title,
	};
};

test("chat releases its reservation when approval validation rejects the request", async () => {
	const { quota, expectActions } = quotaRecorder();
	const { ask, userRows } = setup({
		quota,
		toolCallDao: {
			findForConversation: async () => {
				expectActions(["authorize"]);
				return null;
			},
		},
	});
	await assert.rejects(
		ask([
			userMessage,
			{
				id: "assistant-approval",
				role: "assistant",
				parts: [
					{
						type: "tool-update_issue",
						toolCallId: "unavailable-proposal",
						state: "approval-responded",
						input: { title: "Updated title" },
						approval: { id: "approval-1", approved: true },
					},
				],
			},
		]),
		(err: unknown) =>
			err instanceof ApiError &&
			err.code === ApiErrorCode.AI_APPROVAL_NOT_FOUND,
	);
	expectActions(["authorize", "release"]);
	assert.equal(userRows.length, 0);
});

test("chat releases its reservation on a setup failure before stream creation", async () => {
	const { quota, expectActions } = quotaRecorder();
	const setupError = new Error("model unavailable");
	const { ask } = setup({
		quota,
		provider: {
			...createAiProvider({ AI_ENABLED: "true" }),
			resolveModel: () => {
				throw setupError;
			},
		},
	});
	await assert.rejects(ask(), (error: unknown) => error === setupError);
	expectActions(["authorize", "release"]);
});

test("chat never starts setup or releases a hold when authorization fails", async () => {
	const authorizationError = new Error("quota unavailable");
	const { quota, expectActions } = quotaRecorder(authorizationError);
	const { ask, userRows } = setup({ quota });
	await assert.rejects(ask(), (error: unknown) => error === authorizationError);
	expectActions(["authorize"]);
	assert.equal(userRows.length, 0);
});

test("completed and aborted chat streams finalize exactly once", async () => {
	const completed = quotaRecorder();
	await (await setup({ quota: completed.quota }).ask()).text();
	completed.expectActions(["authorize", "settle"]);

	const aborted = quotaRecorder();
	await (
		await setup({ quota: aborted.quota }).ask(
			[userMessage],
			AbortSignal.abort(),
		)
	).text();
	aborted.expectActions(["authorize", "release"]);
});

test("completed chat settles even if saving the assistant message fails", async () => {
	const { quota, expectActions } = quotaRecorder();
	const { ask, getAssistantRow } = setup({
		quota,
		upsertAssistantError: new Error("assistant row unavailable"),
	});
	const body = await (await ask()).text();
	assert.match(body, /Mock AI reply/);
	assert.equal(getAssistantRow(), null);
	expectActions(["authorize", "settle"]);
});

test("chat streams a mock reply and persists messages and usage", async () => {
	const { service, userRows, usageRows, getAssistantRow, getTitle } = setup();
	const response = await service.chat({
		orgId: ORG_ID,
		userId: USER_ID,
		orgRole: "owner",
		conversationId: CONVERSATION_ID,
		messages: [userMessage],
		locale: "en",
		timezone: "UTC",
		background: (task) => {
			void task();
		},
	});
	assert.equal(response.status, 200);
	const text = await response.text();
	assert.equal(text.includes("Mock AI reply"), true);
	await new Promise((resolve) => setTimeout(resolve, 0));

	assert.equal(userRows.length, 1);
	const assistant = getAssistantRow();
	assert.ok(assistant);
	assert.equal(assistant?.status, "complete");
	assert.equal(assistant?.conversationId, CONVERSATION_ID);
	assert.ok(Array.isArray(assistant?.parts));
	assert.equal(usageRows.length, 1);
	assert.equal(usageRows[0]?.requests, 1);
	assert.equal(getTitle(), "Hello there");
});

test("chat is rejected when the organization disabled AI", async () => {
	const { service, userRows } = setup({ enabled: false });
	await assert.rejects(
		service.chat({
			orgId: ORG_ID,
			userId: USER_ID,
			orgRole: "member",
			conversationId: CONVERSATION_ID,
			messages: [userMessage],
			locale: "en",
			background: (task) => {
				void task();
			},
		}),
		(err: unknown) =>
			err instanceof ApiError && err.code === ApiErrorCode.AI_DISABLED,
	);
	assert.equal(userRows.length, 0);
});

test("chat records a model proposal, approves it, and records one fresh result", async () => {
	const writes: unknown[] = [];
	const audit: AiToolCallUpsert[] = [];
	const capabilityLayer = createCapabilityExecutor({
		capabilities: [
			{
				name: "update_issue",
				titleKey: "ai.capabilities.update_issue.title",
				description: "Update an issue title",
				input: z.object({ title: z.string().trim() }),
				effect: "write",
				scopes: ["write"],
				execute: async (_ctx, input) => {
					writes.push(input);
					return { data: null, summary: "Updated", links: [] };
				},
			},
		],
		memberDao: {
			findByOrgAndUser: async () => ({
				id: "member-1",
				organizationId: ORG_ID,
				userId: USER_ID,
				role: "owner",
				createdAt: new Date(NOW),
				updatedAt: new Date(NOW),
				frozen: false,
			}),
			isOrgFrozen: async () => false,
		},
	});
	const base = createAiProvider({ AI_ENABLED: "true" });
	const proposedModel = new MockLanguageModelV3({
		doStream: async () => ({
			stream: convertArrayToReadableStream([
				{ type: "stream-start", warnings: [] },
				{
					type: "tool-call",
					toolCallId: "proposed-call",
					toolName: "update_issue",
					input: JSON.stringify({ title: " Updated title " }),
				},
				{
					type: "finish",
					finishReason: { unified: "tool-calls", raw: "tool_calls" },
					usage: {
						inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
						outputTokens: { total: 1, text: 1, reasoning: 0 },
					},
				},
			]),
		}),
	});
	const { service, getAssistantRow, usageRows } = setup({
		capabilityLayer,
		provider: {
			...base,
			resolveModel: () =>
				audit.length === 0 ? proposedModel : base.languageModel,
		},
		toolCallDao: {
			findForConversation: async (_org, _conversation, id) => {
				const row = audit.find((item) => item.id === id);
				return row
					? {
							...row,
							createdAt: NOW,
							inputHash: row.inputHash ?? null,
							inputSummary: row.inputSummary ?? null,
							idempotencyKey: row.idempotencyKey ?? null,
							errorCode: row.errorCode ?? null,
							durationMs: row.durationMs ?? null,
						}
					: null;
			},
			claimProposedStatus: async (_org, _conversation, id, status) => {
				const row = audit.find((item) => item.id === id);
				if (row?.status !== "proposed") return false;
				row.status = status;
				return true;
			},
			upsert: async (row) => {
				audit.push({ ...row });
			},
		},
	});
	const ask = (messages: UIMessage[]) =>
		service.chat({
			orgId: ORG_ID,
			userId: USER_ID,
			orgRole: "owner",
			conversationId: CONVERSATION_ID,
			messages,
			locale: "en",
			background: () => undefined,
		});

	await (await ask([userMessage])).text();
	assert.deepEqual(writes, []);
	assert.deepEqual(
		audit.map((entry) => entry.status),
		["proposed"],
	);
	const assistant = getAssistantRow() as UIMessage | null;
	assert.ok(assistant);
	const answered = {
		...assistant,
		parts: assistant.parts.map((part) =>
			isToolUIPart(part) && part.state === "approval-requested"
				? {
						...part,
						state: "approval-responded" as const,
						approval: { ...part.approval, approved: true },
					}
				: part,
		),
	};
	assert.ok(
		answered.parts.some(
			(part) => isToolUIPart(part) && part.state === "approval-responded",
		),
		JSON.stringify(assistant.parts),
	);
	const resumed = await (await ask([userMessage, answered])).text();
	assert.deepEqual(writes, [{ title: "Updated title" }], resumed);
	assert.deepEqual(
		audit.map((entry) => entry.status),
		["approved", "succeeded"],
	);

	const latest = getAssistantRow() as UIMessage | null;
	assert.ok(latest);
	await (
		await ask([userMessage, latest, { ...userMessage, id: "next-message" }])
	).text();
	assert.equal(audit.length, 2);
	assert.deepEqual(
		usageRows.map((row) => row.toolCalls),
		[0, 1, 0],
	);
});
