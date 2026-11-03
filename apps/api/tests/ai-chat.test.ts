import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { UIMessage } from "ai";
import { createAiProvider } from "../src/ai/provider";
import type { CapabilityExecutor } from "../src/capabilities/executor";
import type { AiMessageDao } from "../src/dao/ai-message.dao";
import type { AiToolCallDao } from "../src/dao/ai-tool-call.dao";
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

const setup = ({ enabled = true }: { enabled?: boolean } = {}) => {
	const provider = createAiProvider({ AI_ENABLED: "true" });
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
				assistantRow = row;
			},
		} as unknown as AiMessageDao,
		toolCallDao: {
			findForConversation: async () => null,
			markStatus: async () => undefined,
			upsert: async () => undefined,
			listProposed: async () => [],
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
		settingsService: {
			get: async () => ({ enabled }),
			isEnabled: async () => enabled,
		} as unknown as OrgAiSettingsService,
		capabilityLayer: {
			list: () => [],
			get: () => undefined,
			execute: async () => ({ data: {}, summary: "", links: [] }),
		} as unknown as CapabilityExecutor,
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
		userRows,
		usageRows,
		touched,
		getAssistantRow: () => assistantRow,
		getTitle: () => title,
	};
};

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
