import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { AiConversationDao } from "../src/dao/ai-conversation.dao";
import type { AiMessageDao } from "../src/dao/ai-message.dao";
import type { AiToolCallDao } from "../src/dao/ai-tool-call.dao";
import type { AiConversationDto } from "../src/dto/ai.dto";
import { createAiConversationService } from "../src/services/ai-conversation.service";

const ORG_ID = "org-1";
const USER_ID = "user-1";
const OTHER_USER = "user-2";
const NOW = new Date("2026-01-01T00:00:00.000Z");

const project = {
	id: "project-1",
	orgId: ORG_ID,
	name: "Website",
	key: "WEB",
	description: null,
	color: null,
	archived: false,
	nextNumber: 1,
	health: null,
	targetDate: null,
	leadId: null,
	createdAt: NOW.toISOString(),
	updatedAt: NOW.toISOString(),
};

const issue = {
	id: "issue-1",
	orgId: ORG_ID,
	projectId: "project-1",
	number: 7,
	title: "Login fails",
	description: null,
	statusId: "status-todo",
	status: {
		id: "status-todo",
		orgId: ORG_ID,
		name: "Todo",
		category: "unstarted",
		color: "#3b82f6",
		position: 1,
		isDefault: false,
		createdAt: NOW.toISOString(),
		updatedAt: NOW.toISOString(),
	},
	priority: 2,
	assigneeId: null,
	createdById: USER_ID,
	dueDate: null,
	estimate: null,
	parentId: null,
	cycleId: null,
	deletedAt: null,
	createdAt: NOW.toISOString(),
	updatedAt: NOW.toISOString(),
};

const setup = () => {
	const rows = new Map<string, AiConversationDto>();
	const deleted = new Set<string>();
	let clock = NOW.getTime();

	const toActivity = (row: AiConversationDto) =>
		new Date(row.lastMessageAt ?? row.createdAt).getTime();

	const conversationDao: AiConversationDao = {
		deleteExpired: async () => 0,
		create: async (data) => {
			clock += 1;
			const row: AiConversationDto = {
				...data,
				model: data.model ?? null,
				pinned: false,
				lastMessageAt: null,
				createdAt: new Date(clock).toISOString(),
				updatedAt: new Date(clock).toISOString(),
			};
			rows.set(row.id, row);
			return row;
		},
		findById: async (orgId, userId, id) => {
			const row = rows.get(id);
			return row &&
				row.orgId === orgId &&
				row.userId === userId &&
				!deleted.has(id)
				? row
				: null;
		},
		listByUser: async (orgId, userId, options) => {
			const filtered = [...rows.values()]
				.filter(
					(row) =>
						row.orgId === orgId &&
						row.userId === userId &&
						!deleted.has(row.id) &&
						(!options.search ||
							(row.title ?? "")
								.toLowerCase()
								.includes(options.search.toLowerCase())),
				)
				.sort(
					(a, b) =>
						Number(b.pinned) - Number(a.pinned) ||
						toActivity(b) - toActivity(a) ||
						b.id.localeCompare(a.id),
				);
			let start = 0;
			if (options.cursor) {
				const index = filtered.findIndex(
					(row) =>
						row.id === options.cursor?.id &&
						row.pinned === options.cursor.pinned &&
						toActivity(row) === options.cursor.activityAt,
				);
				start = index + 1;
			}
			const page = filtered.slice(start, start + options.limit + 1);
			return {
				items: page.slice(0, options.limit),
				hasMore: page.length > options.limit,
			};
		},
		update: async (orgId, userId, id, patch) => {
			const row = rows.get(id);
			if (!row || row.orgId !== orgId || row.userId !== userId) return null;
			const updated = { ...row, ...patch };
			rows.set(id, updated);
			return updated;
		},
		softDelete: async (orgId, userId, id) => {
			const row = rows.get(id);
			if (!row || row.orgId !== orgId || row.userId !== userId) return false;
			deleted.add(id);
			return true;
		},
		setTitleIfEmpty: async (orgId, userId, id, title) => {
			const row = rows.get(id);
			if (row && row.orgId === orgId && row.userId === userId && !row.title) {
				rows.set(id, { ...row, title });
			}
		},
		touch: async (orgId, userId, id, patch) => {
			const row = rows.get(id);
			if (row && row.orgId === orgId && row.userId === userId) {
				rows.set(id, {
					...row,
					lastMessageAt: patch.lastMessageAt.toISOString(),
					model: patch.model ?? row.model,
				});
			}
		},
	};

	const messages = [{ id: "m-1", conversationId: "c-1" }];
	const messageDao = {
		listRecent: async () => messages,
	} as unknown as Pick<AiMessageDao, "listRecent">;
	const toolCallDao = {
		listProposed: async () => [{ id: "call-1", status: "proposed" }],
	} as unknown as Pick<AiToolCallDao, "listProposed">;

	const service = createAiConversationService({
		conversationDao,
		messageDao,
		toolCallDao,
		contextDaos: {
			projectDao: {
				findById: async (orgId, id) =>
					orgId === ORG_ID && id === project.id ? project : null,
			},
			issueDao: {
				findById: async (orgId, id) =>
					orgId === ORG_ID && id === issue.id ? issue : null,
			},
		},
	});

	return { service, rows, deleted };
};

const isApiError =
	(code: string, status?: number) =>
	(err: unknown): boolean =>
		err instanceof ApiError &&
		err.code === code &&
		(status === undefined || err.status === status);

test("conversations store the validated context snapshot", async () => {
	const { service } = setup();
	const projectConversation = await service.create(ORG_ID, USER_ID, {
		title: "Project chat",
		contextType: "project",
		contextId: "project-1",
	});
	assert.equal(projectConversation.contextType, "project");
	assert.equal(projectConversation.contextId, "project-1");
	assert.equal(projectConversation.userId, USER_ID);

	const issueConversation = await service.create(ORG_ID, USER_ID, {
		contextType: "issue",
		contextId: "issue-1",
	});
	assert.equal(issueConversation.contextType, "issue");
	assert.equal(issueConversation.title, null);
});

test("conversation context must belong to the organization", async () => {
	const { service } = setup();
	await assert.rejects(
		service.create(ORG_ID, USER_ID, {
			contextType: "project",
			contextId: "missing-project",
		}),
		isApiError(ApiErrorCode.VALIDATION, 400),
	);
	await assert.rejects(
		service.create("org-2", USER_ID, {
			contextType: "issue",
			contextId: "issue-1",
		}),
		isApiError(ApiErrorCode.VALIDATION, 400),
	);
});

test("conversations are owner-scoped for reads, updates and deletes", async () => {
	const { service, deleted } = setup();
	const created = await service.create(ORG_ID, USER_ID, {});

	await assert.rejects(
		service.get(ORG_ID, OTHER_USER, created.id),
		isApiError(ApiErrorCode.AI_CONVERSATION_NOT_FOUND, 404),
	);
	await assert.rejects(
		service.update(ORG_ID, OTHER_USER, created.id, { title: "Hijack" }),
		isApiError(ApiErrorCode.AI_CONVERSATION_NOT_FOUND, 404),
	);
	await assert.rejects(
		service.remove(ORG_ID, OTHER_USER, created.id),
		isApiError(ApiErrorCode.AI_CONVERSATION_NOT_FOUND, 404),
	);

	await service.remove(ORG_ID, USER_ID, created.id);
	assert.equal(deleted.has(created.id), true);
	await assert.rejects(
		service.get(ORG_ID, USER_ID, created.id),
		isApiError(ApiErrorCode.AI_CONVERSATION_NOT_FOUND, 404),
	);
});

test("conversation lists are paginated with an opaque cursor", async () => {
	const { service } = setup();
	const first = await service.create(ORG_ID, USER_ID, { title: "First" });
	const second = await service.create(ORG_ID, USER_ID, { title: "Second" });
	await service.create(ORG_ID, OTHER_USER, { title: "Other user" });

	const pageOne = await service.list(ORG_ID, USER_ID, { limit: 1 });
	assert.equal(pageOne.items.length, 1);
	assert.equal(pageOne.items[0]?.id, second.id);
	assert.ok(pageOne.nextCursor);

	const pageTwo = await service.list(ORG_ID, USER_ID, {
		limit: 1,
		cursor: pageOne.nextCursor ?? undefined,
	});
	assert.equal(pageTwo.items.length, 1);
	assert.equal(pageTwo.items[0]?.id, first.id);
	assert.equal(pageTwo.nextCursor, null);

	await assert.rejects(
		service.list(ORG_ID, USER_ID, { limit: 1, cursor: "not-a-cursor" }),
		isApiError(ApiErrorCode.INVALID_PARAM, 400),
	);
});

test("conversation detail returns recent messages and pending approvals", async () => {
	const { service } = setup();
	const created = await service.create(ORG_ID, USER_ID, {});
	const detail = await service.detail(ORG_ID, USER_ID, created.id);
	assert.equal(detail.conversation.id, created.id);
	assert.equal(detail.messages.length, 1);
	assert.equal(detail.pendingApprovals.length, 1);
});

test("the first user message seeds a truncated title", async () => {
	const { service, rows } = setup();
	const created = await service.create(ORG_ID, USER_ID, {});
	await service.setTitleIfEmpty(
		ORG_ID,
		USER_ID,
		created.id,
		`  ${"Fix login ".repeat(12)}  `,
	);
	const title = rows.get(created.id)?.title ?? "";
	assert.equal(title.includes("Fix login Fix login"), true);
	assert.ok(title.length <= 60);
});
