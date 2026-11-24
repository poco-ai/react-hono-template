import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import { stepCountIs, streamText, type UIMessage } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV3 } from "ai/test";
import { z } from "zod";
import { sha256Hex } from "../src/core/lib/crypto";
import { verifyApprovalResponses } from "../src/features/ai/approvals";
import {
	buildChatTools,
	filterChatCapabilities,
} from "../src/features/ai/tools";
import type {
	CapabilityContext,
	CapabilityEntry,
	CapabilityResult,
} from "../src/features/capabilities/types";

const ORG_ID = "org-1";
const USER_ID = "user-1";
const CONVERSATION_ID = "conversation-1";

const ctx = (
	overrides: Partial<CapabilityContext> = {},
): CapabilityContext => ({
	orgId: ORG_ID,
	actor: {
		userId: USER_ID,
		surface: "chat",
		scopes: ["read", "write", "admin"],
		role: "owner",
	},
	canWrite: true,
	locale: "en",
	webBaseUrl: "https://app.example.com",
	background: () => undefined,
	...overrides,
});

const readCapability: CapabilityEntry = {
	name: "list_issues",
	titleKey: "ai.capabilities.list_issues.title",
	description: "List issues",
	input: z.object({ search: z.string().optional() }),
	effect: "read",
	scopes: ["read"],
	execute: async () => ({
		data: { items: [] },
		summary: "Listed 0 issues.",
		links: [],
	}),
};

const writeCapability: CapabilityEntry = {
	name: "delete_issue",
	titleKey: "ai.capabilities.delete_issue.title",
	description: "Delete an issue",
	input: z.object({ issueId: z.string() }),
	effect: "destructive",
	scopes: ["write"],
	execute: async () => ({
		data: { deleted: true },
		summary: "Deleted.",
		links: [],
	}),
};

const adminCapability: CapabilityEntry = {
	name: "create_project",
	titleKey: "ai.capabilities.create_project.title",
	description: "Create a project",
	input: z.object({ name: z.string() }),
	effect: "write",
	scopes: ["write"],
	minOrgRole: "admin",
	execute: async () => ({
		data: {},
		summary: "Created.",
		links: [],
	}),
};

const layerFor = (calls: { name: string; input: unknown }[]) => ({
	execute: async <TData = unknown>(
		name: string,
		_ctx: CapabilityContext,
		input: unknown,
	): Promise<CapabilityResult<TData>> => {
		calls.push({ name, input });
		return {
			data: { ok: true } as TData,
			summary: "Executed.",
			links: [],
		};
	},
	get: () => undefined,
	list: () => [],
});

test("read tools execute automatically and return serializable output", async () => {
	const calls: { name: string; input: unknown }[] = [];
	const tools = buildChatTools({
		capabilities: [readCapability, writeCapability],
		layer: layerFor(calls),
		ctx: ctx(),
	});

	const read = tools.list_issues as unknown as {
		needsApproval?: boolean;
		execute: (input: unknown, options: unknown) => Promise<unknown>;
	};
	assert.notEqual(read.needsApproval, true);
	const result = await read.execute({ search: "login" }, {});
	assert.deepEqual(result, {
		summary: "Executed.",
		data: { ok: true },
		links: [],
	});
	assert.deepEqual(calls, [
		{ name: "list_issues", input: { search: "login" } },
	]);
});

test("write and destructive tools require user approval", () => {
	const tools = buildChatTools({
		capabilities: [readCapability, writeCapability],
		layer: layerFor([]),
		ctx: ctx(),
	});
	assert.equal(
		(tools.delete_issue as unknown as { needsApproval?: boolean })
			.needsApproval,
		true,
	);
});

test("the AI SDK pauses a write tool call for approval instead of executing it", async () => {
	const calls: { name: string; input: unknown }[] = [];
	const tools = buildChatTools({
		capabilities: [writeCapability],
		layer: layerFor(calls),
		ctx: ctx(),
	});
	const model = new MockLanguageModelV3({
		provider: "mock",
		modelId: "mock-tool",
		doStream: async () => ({
			stream: convertArrayToReadableStream([
				{ type: "stream-start", warnings: [] },
				{
					type: "tool-call",
					toolCallId: "call-approval",
					toolName: "delete_issue",
					input: JSON.stringify({ issueId: "issue-1" }),
				},
				{
					type: "finish",
					finishReason: { unified: "tool-calls", raw: "tool_calls" },
					usage: {
						inputTokens: {
							total: 1,
							noCache: 1,
							cacheRead: 0,
							cacheWrite: 0,
						},
						outputTokens: { total: 1, text: 1, reasoning: 0 },
					},
				},
			]),
		}),
	});

	const result = streamText({
		model,
		messages: [{ role: "user", content: "Delete issue-1" }],
		tools,
		stopWhen: stepCountIs(4),
	});
	const toolCalls = await result.toolCalls;
	const toolResults = await result.toolResults;
	assert.equal(toolCalls.length, 1);
	assert.equal(toolResults.length, 0);
	assert.equal(calls.length, 0);
});

test("role-restricted tools are hidden from members", () => {
	const memberCtx = ctx({
		actor: {
			userId: USER_ID,
			surface: "chat",
			scopes: ["read", "write"],
			role: "member",
		},
	});
	const names = filterChatCapabilities(
		[readCapability, writeCapability, adminCapability],
		memberCtx,
	).map((capability) => capability.name);
	assert.deepEqual(names, ["list_issues", "delete_issue"]);
});

const approvalMessage = (
	toolCallId: string,
	approved: boolean,
	toolName = "delete_issue",
): UIMessage =>
	({
		id: "assistant-1",
		role: "assistant",
		parts: [
			{
				type: `tool-${toolName}`,
				toolCallId,
				state: "approval-responded",
				input: { issueId: "issue-1" },
				approval: { id: `approval-${toolCallId}`, approved },
			},
		],
	}) as unknown as UIMessage;

test("approvals must match a stored proposed tool call", async () => {
	const lookup = {
		findForConversation: async () => null,
		claimProposedStatus: async () => true,
	};
	await assert.rejects(
		verifyApprovalResponses(
			[approvalMessage("call-unknown", true)],
			lookup,
			ORG_ID,
			CONVERSATION_ID,
		),
		(err: unknown) =>
			err instanceof ApiError &&
			err.code === ApiErrorCode.AI_APPROVAL_NOT_FOUND,
	);
});

test("a tampered tool name cannot upgrade the approved action", async () => {
	const lookup = {
		findForConversation: async () => ({
			id: "call-tampered",
			toolName: "update_issue",
			status: "proposed",
		}),
		claimProposedStatus: async () => true,
	};
	await assert.rejects(
		verifyApprovalResponses(
			[approvalMessage("call-tampered", true, "delete_issue")],
			lookup as never,
			ORG_ID,
			CONVERSATION_ID,
		),
		(err: unknown) =>
			err instanceof ApiError &&
			err.code === ApiErrorCode.AI_APPROVAL_NOT_FOUND,
	);
});

test("an approved input that differs from the hash is rejected", async () => {
	const message = approvalMessage("call-hash", true);
	const wrongHash = await sha256Hex(JSON.stringify({ issueId: "other" }));
	const lookup = {
		findForConversation: async () => ({
			id: "call-hash",
			toolName: "delete_issue",
			status: "proposed",
			inputHash: wrongHash,
		}),
		claimProposedStatus: async () => true,
	};
	await assert.rejects(
		verifyApprovalResponses(
			[message],
			lookup as never,
			ORG_ID,
			CONVERSATION_ID,
		),
		(err: unknown) =>
			err instanceof ApiError &&
			err.code === ApiErrorCode.AI_APPROVAL_NOT_FOUND,
	);
});

test("a claimed approval permits exactly one matching write", async () => {
	const message = approvalMessage("call-hash-ok", true);
	const inputHash = await sha256Hex(JSON.stringify({ issueId: "issue-1" }));
	const claimed: string[] = [];
	const lookup = {
		findForConversation: async () => ({
			id: "call-hash-ok",
			toolName: "delete_issue",
			status: "proposed",
			inputHash,
		}),
		claimProposedStatus: async (
			_orgId: string,
			_conversationId: string,
			id: string,
		) => {
			claimed.push(id);
			return true;
		},
	};
	const approvals = await verifyApprovalResponses(
		[message],
		lookup as never,
		ORG_ID,
		CONVERSATION_ID,
	);
	assert.deepEqual(claimed, ["call-hash-ok"]);
	const part = message.parts[0] as { approval?: { approved?: boolean } };
	assert.equal(part.approval?.approved, true);
	const calls: { name: string; input: unknown }[] = [];
	const tools = buildChatTools({
		capabilities: [writeCapability],
		layer: layerFor(calls),
		ctx: ctx(),
		approvals,
	});
	const write = tools.delete_issue as unknown as {
		execute: (
			input: unknown,
			options: { toolCallId: string },
		) => Promise<unknown>;
	};
	const execute = () =>
		write.execute({ issueId: "issue-1" }, { toolCallId: "call-hash-ok" });
	const results = await Promise.allSettled([execute(), execute()]);
	assert.equal(
		results.filter((result) => result.status === "fulfilled").length,
		1,
	);
	assert.deepEqual(calls, [
		{ name: "delete_issue", input: { issueId: "issue-1" } },
	]);
});

test("duplicate decisions are rejected before claiming a proposal", async () => {
	const message = approvalMessage("call-duplicate", true);
	const inputHash = await sha256Hex(JSON.stringify({ issueId: "issue-1" }));
	let claimed = false;
	const lookup = {
		findForConversation: async () => ({
			id: "call-duplicate",
			toolName: "delete_issue",
			status: "proposed",
			inputHash,
		}),
		claimProposedStatus: async () => {
			claimed = true;
			return true;
		},
	};
	await assert.rejects(
		verifyApprovalResponses(
			[message, structuredClone(message)],
			lookup as never,
			ORG_ID,
			CONVERSATION_ID,
		),
		(err: unknown) =>
			err instanceof ApiError && err.code === ApiErrorCode.AI_MESSAGE_INVALID,
	);
	assert.equal(claimed, false);
});

test("a later invalid part prevents earlier proposals from being claimed", async () => {
	const message = {
		id: "assistant-1",
		role: "assistant",
		parts: [
			{
				type: "tool-delete_issue",
				toolCallId: "call-ok",
				state: "approval-responded",
				input: { issueId: "issue-1" },
				approval: { id: "approval-ok", approved: true },
			},
			{
				type: "tool-update_issue",
				toolCallId: "call-bad",
				state: "approval-responded",
				input: { issueId: "issue-1" },
				approval: { id: "approval-bad", approved: true },
			},
		],
	} as unknown as UIMessage;
	const claimed: string[] = [];
	const inputHash = await sha256Hex(JSON.stringify({ issueId: "issue-1" }));
	const lookup = {
		findForConversation: async (
			_orgId: string,
			_conversationId: string,
			id: string,
		) => ({
			id,
			toolName: "delete_issue",
			status: "proposed",
			inputHash,
		}),
		claimProposedStatus: async (
			_orgId: string,
			_conversationId: string,
			id: string,
		) => {
			claimed.push(id);
			return true;
		},
	};
	await assert.rejects(
		verifyApprovalResponses(
			[message],
			lookup as never,
			ORG_ID,
			CONVERSATION_ID,
		),
		(err: unknown) =>
			err instanceof ApiError &&
			err.code === ApiErrorCode.AI_APPROVAL_NOT_FOUND,
	);
	assert.deepEqual(claimed, []);
});

test("replayed approvals are forced to deny instead of executing again", async () => {
	const message = approvalMessage("call-replayed", true);
	let claimed = false;
	const lookup = {
		findForConversation: async () => ({
			id: "call-replayed",
			toolName: "delete_issue",
			status: "approved",
		}),
		claimProposedStatus: async () => {
			claimed = true;
			return true;
		},
	};
	await verifyApprovalResponses(
		[message],
		lookup as never,
		ORG_ID,
		CONVERSATION_ID,
	);
	const part = message.parts[0] as {
		approval?: { approved?: boolean };
	};
	assert.equal(part.approval?.approved, false);
	assert.equal(claimed, false);
});

test("a lost approval claim is forced to deny", async () => {
	const message = approvalMessage("call-race", true);
	const inputHash = await sha256Hex(JSON.stringify({ issueId: "issue-1" }));
	const lookup = {
		findForConversation: async () => ({
			id: "call-race",
			toolName: "delete_issue",
			status: "proposed",
			inputHash,
		}),
		claimProposedStatus: async () => false,
	};
	const approvals = await verifyApprovalResponses(
		[message],
		lookup as never,
		ORG_ID,
		CONVERSATION_ID,
	);
	const part = message.parts[0] as {
		approval?: { approved?: boolean };
	};
	assert.equal(part.approval?.approved, false);
	assert.equal(
		await approvals.consume("call-race", "delete_issue", {
			issueId: "issue-1",
		}),
		false,
	);
});

test("rejected approvals are recorded and keep the denial", async () => {
	const marked: { id: string; status: string }[] = [];
	const inputHash = await sha256Hex(JSON.stringify({ issueId: "issue-1" }));
	const lookup = {
		findForConversation: async () => ({
			id: "call-1",
			toolName: "delete_issue",
			status: "proposed",
			inputHash,
		}),
		claimProposedStatus: async (
			_orgId: string,
			_conversationId: string,
			id: string,
			status: string,
		) => {
			marked.push({ id, status });
			return true;
		},
	};
	const message = approvalMessage("call-1", false);
	await verifyApprovalResponses(
		[message],
		lookup as never,
		ORG_ID,
		CONVERSATION_ID,
	);
	assert.deepEqual(marked, [{ id: "call-1", status: "rejected" }]);
});
