import assert from "node:assert/strict";
import { test } from "node:test";
import { createAiToolCallDao } from "../src/features/ai/dao/ai-tool-call.dao";
import { createTestDb } from "./helpers/test-db";

test("claimProposedStatus is a compare-and-set claim", async () => {
	const { db } = createTestDb();
	const dao = createAiToolCallDao(db);
	await dao.upsert({
		id: "call-1",
		orgId: "org-1",
		userId: "user-1",
		conversationId: "conversation-1",
		surface: "chat",
		toolName: "delete_issue",
		effect: "destructive",
		status: "proposed",
		inputHash: "hash",
	});

	assert.equal(
		await dao.claimProposedStatus(
			"org-1",
			"conversation-1",
			"call-1",
			"approved",
		),
		true,
	);
	assert.equal(
		await dao.claimProposedStatus(
			"org-1",
			"conversation-1",
			"call-1",
			"approved",
		),
		false,
	);
	const stored = await dao.findForConversation(
		"org-1",
		"conversation-1",
		"call-1",
	);
	assert.equal(stored?.status, "approved");

	const base = {
		id: "call-1",
		orgId: "org-1",
		userId: "user-1",
		conversationId: "conversation-1",
		surface: "chat",
		toolName: "delete_issue",
		effect: "destructive" as const,
	};
	await dao.upsert({ ...base, status: "rejected" });
	assert.equal(
		(await dao.findForConversation("org-1", "conversation-1", "call-1"))
			?.status,
		"approved",
	);
	await dao.upsert({ ...base, status: "succeeded" });
	assert.equal(
		(await dao.findForConversation("org-1", "conversation-1", "call-1"))
			?.status,
		"succeeded",
	);
	await dao.upsert({ ...base, status: "failed" });
	assert.equal(
		(await dao.findForConversation("org-1", "conversation-1", "call-1"))
			?.status,
		"succeeded",
	);
});
