import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebhookDeliveryDao } from "../src/dao/webhook-delivery.dao";
import { createTestDb } from "./helpers/test-db";

/**
 * Guards the conditional UPDATE behind `claimAttempt`: it is the only thing
 * that prevents an at-least-once queue message from POSTing twice. Uses the
 * real migrations so the column/index shape matches production D1.
 */
const seedDelivery = async () => {
	const { db } = createTestDb();
	const dao = createWebhookDeliveryDao(db);
	await dao.create({
		id: "del-1",
		orgId: "org-1",
		webhookId: "hook-1",
		event: "issue.created",
		payload: "{}",
		status: "pending",
	});
	return dao;
};

test("claimAttempt wins once per attempt and refuses unknown rows", async () => {
	const dao = await seedDelivery();
	assert.equal(await dao.claimAttempt("missing", 1), false);
	assert.equal(await dao.claimAttempt("del-1", 1), true);
	// A duplicate of the same queue message loses the claim.
	assert.equal(await dao.claimAttempt("del-1", 1), false);
});

test("claimAttempt allows the next attempt after a failure but never after success", async () => {
	const dao = await seedDelivery();
	assert.equal(await dao.claimAttempt("del-1", 1), true);
	await dao.recordAttempt("del-1", {
		attempts: 1,
		status: "failed",
		responseStatus: 500,
		lastError: "HTTP 500",
		lastAttemptAt: new Date(),
	});
	assert.equal(await dao.claimAttempt("del-1", 2), true);
	await dao.recordAttempt("del-1", {
		attempts: 2,
		status: "success",
		responseStatus: 204,
		lastError: null,
		lastAttemptAt: new Date(),
	});
	assert.equal(await dao.claimAttempt("del-1", 3), false);

	const row = await dao.findByIdUnscoped("del-1");
	assert.equal(row?.status, "success");
	assert.equal(row?.attempts, 2);
});
