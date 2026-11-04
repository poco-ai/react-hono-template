import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	type CreateIssueRelationInput,
} from "@workspace/shared";
import { createCapabilityLayer } from "../src/capabilities";
import type { CapabilityDeps } from "../src/capabilities/types";
import type { ActivityInsert } from "../src/dao/activity.dao";
import type { IssueDao } from "../src/dao/issue.dao";
import type { LabelDao } from "../src/dao/label.dao";
import type { MemberDao } from "../src/dao/member.dao";
import type { ProjectDao } from "../src/dao/project.dao";
import type { RelationDao } from "../src/dao/relation.dao";
import type { Dependencies } from "../src/dependencies";
import type { IssueDto } from "../src/dto/issue.dto";
import type { IssueRelationDto } from "../src/dto/relation.dto";
import type { StatusDto } from "../src/dto/status.dto";
import type { Auth } from "../src/lib/auth";
import { createRoutes } from "../src/routes";
import { createIssueService } from "../src/services/issue.service";
import { createRelationService } from "../src/services/relation.service";
import type { StatusService } from "../src/services/status.service";

const NOW = "2026-01-01T00:00:00.000Z";

const status = (id: string, category: string): StatusDto => ({
	id,
	orgId: "org",
	name:
		category === "completed"
			? "Done"
			: category === "canceled"
				? "Canceled"
				: "Todo",
	category,
	color: "#64748b",
	position: category === "completed" ? 1 : 0,
	isDefault: category !== "completed",
	createdAt: NOW,
	updatedAt: NOW,
});

const todo = status("status-todo", "unstarted");
const done = status("status-done", "completed");
const canceled = status("status-canceled", "canceled");

const issue = (
	overrides: Partial<IssueDto> & { status?: StatusDto } = {},
): IssueDto => ({
	id: "issue-1",
	orgId: "org",
	projectId: "project-1",
	number: 1,
	title: "Issue",
	description: null,
	statusId: todo.id,
	status: todo,
	priority: 0,
	assigneeId: null,
	createdById: null,
	dueDate: null,
	estimate: null,
	parentId: null,
	cycleId: null,
	deletedAt: null,
	createdAt: NOW,
	updatedAt: NOW,
	...overrides,
});

const relationServiceFor = ({
	issues = [issue()],
	relations = [] as IssueRelationDto[],
	project = { id: "project-1", orgId: "org", key: "WEB", archived: false },
} = {}) => {
	const state = {
		issues: issues.map((entry) => ({ ...entry })),
		relations: relations.map((entry) => ({ ...entry })),
		activities: [] as ActivityInsert[],
		dispatched: [] as { event: string; data: unknown }[],
	};

	const relationDao: RelationDao = {
		create: async (data, activity) => {
			if (activity) state.activities.push(activity);
			const created: IssueRelationDto = { ...data, createdAt: NOW };
			state.relations.push(created);
			return created;
		},
		findById: async (orgId, id) =>
			state.relations.find(
				(entry) => entry.orgId === orgId && entry.id === id,
			) ?? null,
		findByPair: async (orgId, issueId, relatedIssueId, type) =>
			state.relations.find(
				(entry) =>
					entry.orgId === orgId &&
					entry.issueId === issueId &&
					entry.relatedIssueId === relatedIssueId &&
					entry.type === type,
			) ?? null,
		hasBlocksPath: async (orgId, fromIssueId, toIssueId) => {
			const edges = state.relations.filter(
				(entry) => entry.orgId === orgId && entry.type === "blocks",
			);
			const visited = new Set<string>();
			const queue = [fromIssueId];
			while (queue.length > 0) {
				const current = queue.shift() as string;
				if (current === toIssueId) {
					return true;
				}
				if (visited.has(current)) {
					continue;
				}
				visited.add(current);
				for (const edge of edges) {
					if (edge.issueId === current) {
						queue.push(edge.relatedIssueId);
					}
				}
			}
			return false;
		},
		listByIssue: async (orgId, issueId) =>
			state.relations.filter(
				(entry) =>
					entry.orgId === orgId &&
					(entry.issueId === issueId || entry.relatedIssueId === issueId),
			),
		delete: async (orgId, id, activity) => {
			if (activity) state.activities.push(activity);
			const index = state.relations.findIndex(
				(entry) => entry.orgId === orgId && entry.id === id,
			);
			if (index < 0) return null;
			const [removed] = state.relations.splice(index, 1);
			return removed ?? null;
		},
	};

	const issueDao = {
		findByProjectAndNumber: async (
			orgId: string,
			projectId: string,
			number: number,
		) =>
			state.issues.find(
				(entry) =>
					entry.orgId === orgId &&
					entry.projectId === projectId &&
					entry.number === number,
			) ?? null,
		findById: async (orgId: string, id: string) =>
			state.issues.find((entry) => entry.orgId === orgId && entry.id === id) ??
			null,
		findByIds: async (orgId: string, ids: string[]) =>
			state.issues.filter(
				(entry) => entry.orgId === orgId && ids.includes(entry.id),
			),
		findChildren: async (orgId: string, parentId: string) =>
			state.issues.filter(
				(entry) => entry.orgId === orgId && entry.parentId === parentId,
			),
		hasChildren: async (orgId: string, parentId: string) =>
			state.issues.some(
				(entry) => entry.orgId === orgId && entry.parentId === parentId,
			),
		findLabelIds: async () => [],
	} as unknown as IssueDao;

	const service = createRelationService({
		relationDao,
		issueDao,
		projectDao: {
			findById: async () => project,
		} as unknown as ProjectDao,
		webhooks: {
			dispatch: async (_orgId, event, data) => {
				state.dispatched.push({ event, data });
			},
		},
	});
	return { service, state, issueDao };
};

const isApiError =
	(code: string, status?: number) =>
	(err: unknown): boolean =>
		err instanceof ApiError &&
		err.code === code &&
		(status === undefined || err.status === status);

const link = (
	service: ReturnType<typeof relationServiceFor>["service"],
	input: CreateIssueRelationInput,
) => service.createRelation("org", "project-1", 1, "user-1", input);

test("blocks links are stored once and presented from both perspectives", async () => {
	const second = issue({ id: "issue-2", number: 2, title: "Blocker" });
	const { service, state } = relationServiceFor({
		issues: [issue(), second],
	});

	await link(service, { relatedIssueId: "issue-2", type: "blocks" });

	assert.equal(state.relations.length, 1);
	assert.equal(state.relations[0]?.issueId, "issue-1");
	assert.equal(state.relations[0]?.relatedIssueId, "issue-2");
	assert.equal(state.relations[0]?.type, "blocks");
	assert.equal(state.activities[0]?.field, "relation:blocks");
	assert.equal(state.activities[0]?.newValue, "WEB-2");
	assert.equal(state.dispatched[0]?.event, "issue.updated");

	const fromFirst = await service.listRelations("org", "project-1", 1);
	assert.deepEqual(
		fromFirst.blocks.map((entry) => entry.issue.number),
		[2],
	);
	assert.deepEqual(fromFirst.blockedBy, []);

	const fromSecond = await service.listRelations("org", "project-1", 2);
	assert.deepEqual(fromSecond.blocks, []);
	assert.deepEqual(
		fromSecond.blockedBy.map((entry) => entry.issue.number),
		[1],
	);
});

test("blocked_by input stores the reverse canonical direction", async () => {
	const second = issue({ id: "issue-2", number: 2 });
	const { service, state } = relationServiceFor({
		issues: [issue(), second],
	});

	await link(service, { relatedIssueId: "issue-2", type: "blocked_by" });

	assert.equal(state.relations[0]?.issueId, "issue-2");
	assert.equal(state.relations[0]?.relatedIssueId, "issue-1");
	assert.equal(state.activities[0]?.field, "relation:blocked_by");
	const grouped = await service.listRelations("org", "project-1", 1);
	assert.deepEqual(
		grouped.blockedBy.map((entry) => entry.issue.number),
		[2],
	);
});

test("related is symmetric, deduped and grouped on both sides", async () => {
	const second = issue({ id: "issue-2", number: 2 });
	const { service, state } = relationServiceFor({
		issues: [issue(), second],
	});

	await link(service, { relatedIssueId: "issue-2", type: "related" });
	// Reverse input resolves to the same canonical pair.
	await assert.rejects(
		service.createRelation("org", "project-1", 2, "user-1", {
			relatedIssueId: "issue-1",
			type: "related",
		}),
		isApiError(ApiErrorCode.ISSUE_RELATION_EXISTS, 409),
	);
	assert.equal(state.relations.length, 1);

	const grouped = await service.listRelations("org", "project-1", 1);
	assert.deepEqual(
		grouped.related.map((entry) => entry.issue.number),
		[2],
	);
});

test("duplicates are symmetric: ids are sorted and grouped for both issues", async () => {
	const second = issue({ id: "issue-2", number: 2 });
	const { service, state } = relationServiceFor({ issues: [issue(), second] });

	// Created from the *second* issue, stored with the ids sorted.
	await service.createRelation("org", "project-1", 2, "user-1", {
		relatedIssueId: "issue-1",
		type: "duplicates",
	});
	assert.equal(state.relations.length, 1);
	assert.equal(state.relations[0]?.issueId, "issue-1");
	assert.equal(state.relations[0]?.relatedIssueId, "issue-2");
	assert.equal(state.relations[0]?.type, "duplicates");

	// The reverse input resolves to the same canonical row.
	await assert.rejects(
		link(service, { relatedIssueId: "issue-2", type: "duplicates" }),
		isApiError(ApiErrorCode.ISSUE_RELATION_EXISTS, 409),
	);
	assert.equal(state.relations.length, 1);

	const fromFirst = await service.listRelations("org", "project-1", 1);
	const fromSecond = await service.listRelations("org", "project-1", 2);
	assert.equal(fromFirst.duplicates.length, 1);
	assert.equal(fromSecond.duplicates.length, 1);
	assert.equal(fromFirst.duplicates[0]?.issue.id, "issue-2");
	assert.equal(fromSecond.duplicates[0]?.issue.id, "issue-1");
});

test("self, cross-project, cross-org and duplicate links are rejected", async () => {
	const otherProject = issue({
		id: "issue-2",
		number: 2,
		projectId: "project-2",
	});
	const foreign = issue({ id: "issue-3", number: 3, orgId: "other-org" });
	const { service } = relationServiceFor({
		issues: [issue(), otherProject, foreign],
	});

	await assert.rejects(
		link(service, { relatedIssueId: "issue-1", type: "blocks" }),
		isApiError(ApiErrorCode.ISSUE_RELATION_INVALID, 400),
	);
	await assert.rejects(
		link(service, { relatedIssueId: "issue-2", type: "related" }),
		isApiError(ApiErrorCode.ISSUE_RELATION_INVALID, 400),
	);
	await assert.rejects(
		link(service, { relatedIssueId: "issue-3", type: "related" }),
		isApiError(ApiErrorCode.ISSUE_NOT_FOUND, 404),
	);
});

test("duplicate links and direct blocking cycles are rejected", async () => {
	const second = issue({ id: "issue-2", number: 2 });
	const { service } = relationServiceFor({ issues: [issue(), second] });

	await link(service, { relatedIssueId: "issue-2", type: "blocks" });
	await assert.rejects(
		link(service, { relatedIssueId: "issue-2", type: "blocks" }),
		isApiError(ApiErrorCode.ISSUE_RELATION_EXISTS, 409),
	);
	await assert.rejects(
		service.createRelation("org", "project-1", 2, "user-1", {
			relatedIssueId: "issue-1",
			type: "blocks",
		}),
		isApiError(ApiErrorCode.ISSUE_RELATION_CYCLE, 409),
	);
});

test("multi-hop blocking cycles are rejected", async () => {
	const second = issue({ id: "issue-2", number: 2 });
	const third = issue({ id: "issue-3", number: 3 });
	const { service, state } = relationServiceFor({
		issues: [issue(), second, third],
	});

	// A blocks B, B blocks C.
	await link(service, { relatedIssueId: "issue-2", type: "blocks" });
	await service.createRelation("org", "project-1", 2, "user-1", {
		relatedIssueId: "issue-3",
		type: "blocks",
	});

	// C blocks A would close the A → B → C loop.
	await assert.rejects(
		service.createRelation("org", "project-1", 3, "user-1", {
			relatedIssueId: "issue-1",
			type: "blocks",
		}),
		isApiError(ApiErrorCode.ISSUE_RELATION_CYCLE, 409),
	);
	assert.equal(state.relations.length, 2);
});

test("removing a link records activity and clears both perspectives", async () => {
	const second = issue({ id: "issue-2", number: 2 });
	const { service, state } = relationServiceFor({
		issues: [issue(), second],
	});
	const created = await link(service, {
		relatedIssueId: "issue-2",
		type: "blocks",
	});

	await service.deleteRelation("org", "project-1", 1, "user-1", created.id);

	assert.equal(state.relations.length, 0);
	assert.equal(state.activities[1]?.field, "relation:blocks");
	assert.equal(state.activities[1]?.oldValue, "WEB-2");
	assert.equal(state.activities[1]?.newValue, null);
	assert.deepEqual(await service.listRelations("org", "project-1", 2), {
		blocks: [],
		blockedBy: [],
		related: [],
		duplicates: [],
	});
});

test("removing a relation that belongs to another issue returns 404", async () => {
	const second = issue({ id: "issue-2", number: 2 });
	const third = issue({ id: "issue-3", number: 3 });
	const { service, state } = relationServiceFor({
		issues: [issue(), second, third],
	});
	const created = await link(service, {
		relatedIssueId: "issue-2",
		type: "related",
	});

	await assert.rejects(
		service.deleteRelation("org", "project-1", 3, "user-1", created.id),
		isApiError(ApiErrorCode.ISSUE_RELATION_INVALID, 404),
	);
	assert.equal(state.relations.length, 1);
	assert.equal(state.activities.length, 1);
});

const issueServiceFor = ({
	issues = [issue()],
	children = [] as IssueDto[],
} = {}) => {
	const state = {
		issues: issues.map((entry) => ({ ...entry })),
		children: children.map((entry) => ({ ...entry })),
		created: [] as Record<string, unknown>[],
		createdActivities: [] as ActivityInsert[],
		updatedActivities: [] as ActivityInsert[][],
		updatedPatches: [] as Record<string, unknown>[],
	};

	const issueDao = {
		findByProjectAndNumber: async (
			orgId: string,
			projectId: string,
			issueNumber: number,
		) =>
			state.issues.find(
				(entry) =>
					entry.orgId === orgId &&
					entry.projectId === projectId &&
					entry.number === issueNumber,
			) ?? null,
		findById: async (orgId: string, id: string) =>
			[...state.issues, ...state.children].find(
				(entry) => entry.orgId === orgId && entry.id === id,
			) ?? null,
		findChildren: async (orgId: string, parentId: string) =>
			state.children.filter(
				(entry) => entry.orgId === orgId && entry.parentId === parentId,
			),
		hasChildren: async (orgId: string, parentId: string) =>
			state.children.some(
				(entry) => entry.orgId === orgId && entry.parentId === parentId,
			),
		createWithNumber: async (
			data: Record<string, unknown>,
			_labelIds: string[],
			activities: ActivityInsert[],
		) => {
			state.created.push(data);
			state.createdActivities.push(...activities);
			return issue({
				id: data.id as string,
				number: 9,
				title: data.title as string,
				statusId: data.statusId as string,
				parentId: (data.parentId as string | null) ?? null,
			});
		},
		update: async (
			orgId: string,
			id: string,
			patch: Partial<{ parentId: string | null }>,
			_labelIds: string[] | undefined,
			activities: ActivityInsert[],
		) => {
			state.updatedActivities.push(activities);
			state.updatedPatches.push(patch as Record<string, unknown>);
			const current = state.issues.find(
				(entry) => entry.orgId === orgId && entry.id === id,
			);
			if (!current) return null;
			Object.assign(current, patch);
			return { ...current };
		},
		findLabelIds: async () => [],
		findPrevNumber: async () => null,
		findNextNumber: async () => null,
	} as unknown as IssueDao;

	const issueService = createIssueService({
		issueDao,
		labelDao: {
			findByIds: async () => [],
		} as unknown as LabelDao,
		projectDao: {
			findById: async () => ({
				id: "project-1",
				orgId: "org",
				key: "WEB",
				archived: false,
			}),
		} as unknown as ProjectDao,
		memberDao: {
			findByOrgAndUser: async () => ({ role: "member" }),
		} as unknown as MemberDao,
		cycleDao: { findById: async () => null },
		statusService: {
			resolveStatus: async () => todo,
			resolveStatusIds: async () => [],
		} as unknown as StatusService,
	});
	return { service: issueService, state };
};
test("creating a sub-issue validates same project and two-level depth", async () => {
	const parent = issue({ id: "parent", number: 2 });
	const nested = issue({
		id: "nested",
		number: 3,
		parentId: "parent",
	});
	const otherProject = issue({
		id: "other",
		number: 4,
		projectId: "project-2",
	});
	const { service, state } = issueServiceFor({
		issues: [parent, nested, otherProject],
	});

	await service.createIssue(
		"org",
		"project-1",
		"user-1",
		{ title: "Child", parentId: "parent" },
		undefined,
	);
	assert.equal(state.created[0]?.parentId, "parent");
	assert.equal(
		state.createdActivities.some((activity) => activity.field === "parent"),
		true,
	);
	assert.equal(
		state.createdActivities.find((activity) => activity.field === "parent")
			?.newValue,
		"WEB-2",
	);

	await assert.rejects(
		service.createIssue(
			"org",
			"project-1",
			"user-1",
			{ title: "Too deep", parentId: "nested" },
			undefined,
		),
		isApiError(ApiErrorCode.ISSUE_PARENT_DEPTH, 400),
	);
	await assert.rejects(
		service.createIssue(
			"org",
			"project-1",
			"user-1",
			{ title: "Wrong project", parentId: "other" },
			undefined,
		),
		isApiError(ApiErrorCode.ISSUE_PARENT_INVALID, 400),
	);
});

test("updating parent rejects self and issues that already have children", async () => {
	const current = issue({ id: "issue-1", number: 1 });
	const child = issue({
		id: "issue-2",
		number: 2,
		parentId: "issue-1",
	});
	const topLevel = issue({ id: "issue-3", number: 3 });
	const { service } = issueServiceFor({
		issues: [current, child, topLevel],
		children: [child],
	});

	await assert.rejects(
		service.updateIssue("org", "project-1", 1, "user-1", {
			parentId: "issue-1",
		}),
		isApiError(ApiErrorCode.ISSUE_PARENT_INVALID, 400),
	);
	// A nested parent is rejected by the depth rule.
	await assert.rejects(
		service.updateIssue("org", "project-1", 1, "user-1", {
			parentId: "issue-2",
		}),
		isApiError(ApiErrorCode.ISSUE_PARENT_DEPTH, 400),
	);
	// A top-level target still cannot adopt an issue that already has children.
	await assert.rejects(
		service.updateIssue("org", "project-1", 1, "user-1", {
			parentId: "issue-3",
		}),
		isApiError(ApiErrorCode.ISSUE_PARENT_DEPTH, 400),
	);
});

test("parent changes write activity with issue keys", async () => {
	const current = issue({ id: "issue-1", number: 1 });
	const parent = issue({ id: "parent", number: 2 });
	const { service, state } = issueServiceFor({
		issues: [current, parent],
	});

	await service.updateIssue("org", "project-1", 1, "user-1", {
		parentId: "parent",
	});

	const diff = state.updatedActivities[0]?.find(
		(activity) => activity.field === "parent",
	);
	assert.equal(diff?.oldValue, null);
	assert.equal(diff?.newValue, "WEB-2");

	// Detaching clears the column and records the previous parent key.
	await service.updateIssue("org", "project-1", 1, "user-1", {
		parentId: null,
	});
	assert.equal(state.updatedPatches[1]?.parentId, null);
	const detach = state.updatedActivities[1]?.find(
		(activity) => activity.field === "parent",
	);
	assert.equal(detach?.oldValue, "WEB-2");
	assert.equal(detach?.newValue, null);
});

test("issue detail exposes parent summary and terminal sub-issue progress", async () => {
	const parent = issue({ id: "parent", number: 2, title: "Parent" });
	const childDone = issue({
		id: "child-done",
		number: 3,
		statusId: done.id,
		status: done,
		parentId: "issue-1",
	});
	const childCanceled = issue({
		id: "child-canceled",
		number: 5,
		statusId: canceled.id,
		status: canceled,
		parentId: "issue-1",
	});
	const childTodo = issue({
		id: "child-todo",
		number: 4,
		parentId: "issue-1",
	});
	const { service } = issueServiceFor({
		issues: [issue({ parentId: "parent" }), parent],
		children: [childDone, childCanceled, childTodo],
	});

	const detail = await service.getIssue("org", "project-1", 1);

	assert.equal(detail.parent?.number, 2);
	assert.equal(detail.subIssues.length, 3);
	// completed + canceled both count as terminal.
	assert.deepEqual(detail.subIssueProgress, { done: 2, total: 3 });
	assert.equal(detail.parentId, "parent");
});

test("non-members get a 404 before relation handlers run", async () => {
	const auth = {
		api: {
			getSession: async () => ({ user: { id: "user" } }),
		},
	} as unknown as Auth;
	const dependencies = {
		daos: {
			memberDao: {
				findByOrgAndUser: async () => null,
			},
		},
		services: {},
	} as unknown as Dependencies;
	const app = createRoutes({ auth, dependencies });

	const response = await app.request(
		"/api/orgs/org/projects/project-1/issues/1/relations",
	);
	assert.equal(response.status, 404);
});

test("relation routes validate input and delegate to the service", async () => {
	const calls: unknown[] = [];
	const auth = {
		api: {
			getSession: async () => ({ user: { id: "user-1" } }),
		},
	} as unknown as Auth;
	const dependencies = {
		daos: {
			memberDao: {
				findByOrgAndUser: async (orgId: string) => ({
					orgId,
					role: "member",
					frozen: false,
				}),
			},
		},
		services: {
			relationService: {
				listRelations: async (...args: unknown[]) => {
					calls.push(args);
					return { blocks: [], blockedBy: [], related: [], duplicates: [] };
				},
				createRelation: async (...args: unknown[]) => {
					calls.push(args);
					return { id: "relation-1" };
				},
				deleteRelation: async (...args: unknown[]) => {
					calls.push(args);
				},
			},
		},
	} as unknown as Dependencies;
	const app = createRoutes({ auth, dependencies });
	const base = "/api/orgs/org/projects/project-1/issues/1/relations";

	const created = await app.request(base, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ relatedIssueId: "issue-2", type: "blocks" }),
	});
	assert.equal(created.status, 200);

	const invalid = await app.request(base, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ relatedIssueId: "issue-2", type: "unknown" }),
	});
	assert.equal(invalid.status, 400);

	const listed = await app.request(base);
	assert.equal(listed.status, 200);

	const removed = await app.request(`${base}/relation-1`, {
		method: "DELETE",
	});
	assert.equal(removed.status, 200);
	assert.equal(calls.length, 3);
});

test("relation capabilities are exposed and execute through the capability layer", async () => {
	const second = issue({ id: "issue-2", number: 2 });
	const { service } = relationServiceFor({ issues: [issue(), second] });
	await link(service, { relatedIssueId: "issue-2", type: "blocks" });

	const deps = {
		services: {
			issueService: {
				getIssueById: async (_orgId: string, id: string) => {
					if (id === "issue-1") return issue();
					if (id === "issue-2") return second;
					throw new ApiError(
						404,
						ApiErrorCode.ISSUE_NOT_FOUND,
						"Issue not found",
					);
				},
				getIssue: async () => issue(),
			},
			relationService: service,
		},
		daos: {
			memberDao: {
				findByOrgAndUser: async (orgId: string) => ({
					organizationId: orgId,
					role: "owner",
					frozen: false,
				}),
				isOrgFrozen: async () => false,
			},
		},
	} as unknown as CapabilityDeps;
	const layer = createCapabilityLayer(deps);
	const names = layer.list().map((entry) => entry.name);
	assert.ok(names.includes("list_issue_relations"));
	assert.ok(names.includes("link_issues"));
	assert.ok(names.includes("unlink_issue"));

	const result = await layer.execute(
		"list_issue_relations",
		{
			orgId: "org",
			actor: {
				userId: "user-1",
				surface: "mcp",
				scopes: ["read", "write"],
				role: "owner",
			},
			canWrite: true,
			locale: "en",
			webBaseUrl: "https://app.example.com",
			background: (task) => {
				void task().catch(() => undefined);
			},
		},
		{ issueId: "issue-1" },
	);
	const data = result.data as {
		blocks: { issue: { number: number } }[];
	};
	assert.deepEqual(
		data.blocks.map((entry) => entry.issue.number),
		[2],
	);
});
