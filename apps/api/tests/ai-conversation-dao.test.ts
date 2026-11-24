import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { aiConversations } from "../src/db/schema";
import { createAiConversationDao } from "../src/features/ai/dao/ai-conversation.dao";
import { seedOrganization, seedUser } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

test("conversation DAO pages across pin groups and uses millisecond retention", async () => {
	const { sqlite, db } = createTestDb();
	const orgId = "org";
	const userId = "user";
	seedOrganization(sqlite, { id: orgId });
	seedUser(sqlite, { id: userId });
	const dao = createAiConversationDao(db);
	const create = (id: string) =>
		dao.create({
			id,
			orgId,
			userId,
			title: null,
			contextType: null,
			contextId: null,
		});

	const first = await create("pinned");
	const second = await create("unpinned");
	await dao.update(orgId, userId, first.id, { pinned: true });
	const page = await dao.listByUser(orgId, userId, {
		limit: 1,
		cursor: {
			pinned: true,
			activityAt: Date.parse(first.createdAt),
			id: first.id,
		},
	});
	assert.deepEqual(
		page.items.map(({ id }) => id),
		[second.id],
	);

	await db
		.update(aiConversations)
		.set({ updatedAt: new Date("2026-05-01T00:00:00Z") })
		.where(eq(aiConversations.id, first.id));
	await db
		.update(aiConversations)
		.set({ updatedAt: new Date("2026-05-30T00:00:00Z") })
		.where(eq(aiConversations.id, second.id));
	assert.equal(await dao.deleteExpired(new Date("2026-06-01T00:00:00Z")), 1);
	assert.equal(await dao.findById(orgId, userId, first.id), null);
	assert.equal((await dao.findById(orgId, userId, second.id))?.id, second.id);
});
