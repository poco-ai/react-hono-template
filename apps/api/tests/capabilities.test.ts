import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import { generateText, streamText } from "ai";
import { createAiProvider } from "../src/ai/provider";
import {
	type CapabilityContext,
	type CapabilityDeps,
	createCapabilityLayer,
	createCapabilityRegistry,
} from "../src/capabilities";
import type { IssueDetailDto } from "../src/dto/issue.dto";
import type { ProjectDto } from "../src/dto/project.dto";

const ORG_ID = "org-1";
const USER_ID = "user-1";
const NOW = "2026-01-01T00:00:00.000Z";

const status = {
	id: "status-todo",
	orgId: ORG_ID,
	name: "Todo",
	category: "unstarted",
	color: "#3b82f6",
	position: 1,
	isDefault: false,
	createdAt: NOW,
	updatedAt: NOW,
};

const issueDto = (overrides: Partial<IssueDetailDto> = {}): IssueDetailDto => ({
	id: "issue-1",
	orgId: ORG_ID,
	projectId: "project-1",
	number: 7,
	title: "Login fails",
	description: "Steps to reproduce",
	statusId: status.id,
	status,
	priority: 2,
	assigneeId: null,
	createdById: USER_ID,
	dueDate: null,
	estimate: 3,
	parentId: null,
	cycleId: null,
	deletedAt: null,
	createdAt: NOW,
	updatedAt: NOW,
	labelIds: ["label-1"],
	...overrides,
});

const projectDto = (overrides: Partial<ProjectDto> = {}): ProjectDto => ({
	id: "project-1",
	orgId: ORG_ID,
	name: "Website",
	key: "WEB",
	description: null,
	color: "#6366f1",
	archived: false,
	nextNumber: 8,
	health: null,
	targetDate: null,
	leadId: null,
	createdAt: NOW,
	updatedAt: NOW,
	...overrides,
});

type SetupOptions = {
	role?: string;
	frozen?: boolean;
	member?: boolean;
	issue?: Partial<IssueDetailDto>;
};

const setup = (options: SetupOptions = {}) => {
	const issue = issueDto(options.issue);
	const project = projectDto();
	const calls = {
		listIssues: [] as { orgId: string; projectId: string | null }[],
		listIssuesInput: [] as unknown[],
		listProjects: [] as { orgId: string; options?: unknown }[],
		createIssue: [] as {
			orgId: string;
			projectId: string;
			userId: string | null;
		}[],
		deleteIssue: [] as { orgId: string; projectId: string; number: number }[],
		createProject: [] as { orgId: string; input: unknown }[],
		backgroundTasks: 0,
	};

	const deps = {
		services: {
			issueService: {
				listIssues: async (
					orgId: string,
					projectId: string | null,
					input?: unknown,
				) => {
					calls.listIssues.push({ orgId, projectId });
					calls.listIssuesInput.push(input);
					return { items: [issue], total: 1, page: 1, pageSize: 20 };
				},
				getIssue: async () => issue,
				getIssueById: async () => issue,
				createIssue: async (
					orgId: string,
					projectId: string,
					userId: string | null,
					_input: unknown,
					background?: (task: () => Promise<void>) => void,
				) => {
					calls.createIssue.push({ orgId, projectId, userId });
					background?.(async () => {
						calls.backgroundTasks += 1;
					});
					return issue;
				},
				updateIssue: async (
					_orgId: string,
					_projectId: string,
					_number: number,
					_userId: string | null,
					patch: Partial<IssueDetailDto>,
				) => ({ ...issue, ...patch, labelIds: issue.labelIds }),
				deleteIssue: async (
					orgId: string,
					projectId: string,
					number: number,
				) => {
					calls.deleteIssue.push({ orgId, projectId, number });
				},
			},
			projectService: {
				listProjects: async (orgId: string, options?: unknown) => {
					calls.listProjects.push({ orgId, options });
					return [
						{
							...project,
							openIssueCount: 1,
							totalIssueCount: 2,
							stripeCustomerId: "cus_secret",
						},
					];
				},
				getProject: async () => ({
					...project,
					stripeCustomerId: "cus_secret",
				}),
				createProject: async (orgId: string, input: unknown) => {
					calls.createProject.push({ orgId, input });
					return project;
				},
			},
			commentService: {
				listComments: async () => ({
					items: [],
					total: 0,
					page: 1,
					pageSize: 20,
				}),
				createComment: async () => {
					throw new Error("not used");
				},
				updateComment: async () => {
					throw new Error("not used");
				},
				deleteComment: async () => {
					throw new Error("not used");
				},
			},
			labelService: {
				listLabels: async () => [],
				createLabel: async () => ({
					id: "label-1",
					orgId: ORG_ID,
					name: "Bug",
					color: "#ef4444",
					createdAt: NOW,
					updatedAt: NOW,
				}),
				updateLabel: async () => {
					throw new Error("not used");
				},
				deleteLabel: async () => {
					throw new Error("not used");
				},
			},
			activityService: {
				listByIssue: async () => [],
				listByOrg: async () => [],
			},
			statusService: {
				listStatuses: async () => [status],
			},
		},
		daos: {
			memberDao: {
				findByOrgAndUser: async (orgId: string, userId: string) =>
					options.member === false
						? undefined
						: {
								id: "member-1",
								organizationId: orgId,
								userId,
								role: options.role ?? "owner",
								createdAt: new Date(NOW),
								updatedAt: new Date(NOW),
								frozen: options.frozen ?? false,
							},
				isOrgFrozen: async () => options.frozen ?? false,
				listMembershipsByUser: async () => [
					{
						id: ORG_ID,
						name: "Acme",
						slug: "acme",
						frozen: options.frozen ?? false,
						role: options.role ?? "owner",
					},
				],
				listByOrg: async () => [
					{
						userId: USER_ID,
						name: "Ada",
						email: "ada@example.com",
						image: null,
						role: options.role ?? "owner",
						createdAt: new Date(NOW),
					},
				],
			},
			organizationDao: {
				findById: async (orgId: string) => ({
					id: orgId,
					name: "Acme",
					slug: "acme",
					frozen: options.frozen ?? false,
					createdAt: NOW,
					plan: "free",
					status: null,
					members: 1,
					issues: 2,
					stripeCustomerId: "cus_secret",
				}),
			},
			projectDao: {
				findByKey: async () => project,
			},
		},
	} as unknown as CapabilityDeps;

	return { deps, calls };
};

const context = (
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
	webBaseUrl: "https://app.example.com/",
	background: (task) => {
		void task().catch(() => undefined);
	},
	...overrides,
});

const isApiError =
	(code: string, status?: number) =>
	(err: unknown): boolean =>
		err instanceof ApiError &&
		err.code === code &&
		(status === undefined || err.status === status);

test("capability registry exposes read and write capabilities", () => {
	const { deps } = setup();
	const names = createCapabilityRegistry(deps).map(
		(capability) => capability.name,
	);
	for (const expected of [
		"list_orgs",
		"get_org",
		"list_issues",
		"search_issues",
		"get_issue",
		"create_issue",
		"update_issue",
		"delete_issue",
		"create_project",
		"create_label",
	]) {
		assert.ok(names.includes(expected), `missing capability ${expected}`);
	}
});

test("a write capability is denied when the actor only has the read scope", async () => {
	const { deps } = setup();
	const layer = createCapabilityLayer(deps);
	await assert.rejects(
		layer.execute(
			"create_issue",
			context({
				actor: {
					userId: USER_ID,
					surface: "mcp",
					scopes: ["read"],
				},
			}),
			{ projectId: "project-1", title: "New issue" },
		),
		isApiError(ApiErrorCode.MCP_FORBIDDEN_SCOPE, 403),
	);
});

test("admin-only capabilities are denied for a member role", async () => {
	const { deps } = setup({ role: "member" });
	const layer = createCapabilityLayer(deps);
	await assert.rejects(
		layer.execute("create_project", context(), {
			name: "Docs",
			key: "DOC",
		}),
		isApiError(ApiErrorCode.FORBIDDEN, 403),
	);
});

test("an API key with the admin scope may run admin-only capabilities", async () => {
	const { deps, calls } = setup();
	const layer = createCapabilityLayer(deps);
	const result = await layer.execute<{ project: { id: string } }>(
		"create_project",
		context({
			actor: {
				keyId: "key-1",
				surface: "mcp",
				scopes: ["admin"],
			},
		}),
		{ name: "Docs", key: "DOC" },
	);
	assert.equal(result.data.project.id, "project-1");
	assert.deepEqual(calls.createProject, [
		{ orgId: ORG_ID, input: { name: "Docs", key: "DOC" } },
	]);
});

test("frozen organizations reject writes but still allow reads", async () => {
	const { deps, calls } = setup({ frozen: true });
	const layer = createCapabilityLayer(deps);

	await assert.rejects(
		layer.execute("create_issue", context(), {
			projectId: "project-1",
			title: "Blocked",
		}),
		isApiError(ApiErrorCode.ORG_FROZEN, 403),
	);

	const read = await layer.execute<{ projects: unknown[] }>(
		"list_projects",
		context(),
		{ includeArchived: false },
	);
	assert.equal(read.data.projects.length, 1);
	assert.equal(calls.listProjects[0]?.orgId, ORG_ID);
});

test("writes are denied when the conversation is read-only", async () => {
	const { deps } = setup();
	const layer = createCapabilityLayer(deps);
	await assert.rejects(
		layer.execute("create_issue", context({ canWrite: false }), {
			projectId: "project-1",
			title: "Nope",
		}),
		isApiError(ApiErrorCode.FORBIDDEN, 403),
	);
});

test("org-scoped capabilities require an organization context", async () => {
	const { deps } = setup();
	const layer = createCapabilityLayer(deps);
	await assert.rejects(
		layer.execute("list_projects", context({ orgId: undefined }), {}),
		isApiError(ApiErrorCode.MCP_ORG_REQUIRED, 400),
	);
});

test("capabilities pass the context organization to services (no cross-org)", async () => {
	const { deps, calls } = setup();
	const layer = createCapabilityLayer(deps);
	await layer.execute("list_issues", context({ orgId: "org-9" }), {
		page: 1,
		pageSize: 20,
		sort: "updated",
	});
	assert.deepEqual(calls.listIssues, [{ orgId: "org-9", projectId: null }]);
});

test("list_issues and search_issues forward filter, sorts and grouping", async () => {
	const { deps, calls } = setup();
	const layer = createCapabilityLayer(deps);
	const filter = {
		type: "condition" as const,
		field: "priority" as const,
		operator: "eq" as const,
		value: 2,
	};
	const sort = [{ field: "dueDate" as const, direction: "asc" as const }];

	await layer.execute("list_issues", context(), {
		filter,
		sort,
		groupBy: "assignee",
	});
	await layer.execute("search_issues", context(), {
		search: "login",
		filter,
		sort,
	});

	const [listInput, searchInput] = calls.listIssuesInput as Record<
		string,
		unknown
	>[];
	assert.deepEqual(listInput?.filter, filter);
	assert.deepEqual(listInput?.sort, sort);
	assert.equal(listInput?.groupBy, "assignee");
	assert.equal(searchInput?.search, "login");
	assert.deepEqual(searchInput?.filter, filter);
	assert.deepEqual(searchInput?.sort, sort);

	// Invalid filter trees are rejected by the capability input schema.
	await assert.rejects(
		layer.execute("list_issues", context(), {
			filter: { type: "condition", field: "title", operator: "eq", value: 1 },
		}),
		(error: unknown) => error instanceof ApiError && error.status === 400,
	);
});

test("list_issues documents its filters, sorting, grouping and archive rules", () => {
	const [entry] = createCapabilityRegistry(setup().deps).filter(
		(capability) => capability.name === "list_issues",
	);
	assert.ok(entry);
	for (const token of [
		"filter",
		"sort",
		"groupBy",
		"includeArchived",
		"cycleId",
		"archived",
	]) {
		assert.ok(
			entry.description.includes(token),
			`description should mention ${token}`,
		);
	}
	// Archived issues remain editable; the description must not claim otherwise.
	assert.equal(entry.description.includes("read-only"), false);
});

test("issue summaries expose archivedAt so tools can spot archived issues", async () => {
	const active = createCapabilityLayer(setup().deps);
	const activeResult = await active.execute<{
		issue: { archivedAt?: string | null };
	}>("get_issue", context(), { issueId: "issue-1" });
	assert.equal(activeResult.data.issue.archivedAt, null);

	const archived = createCapabilityLayer(
		setup({ issue: { archivedAt: NOW } }).deps,
	);
	const archivedResult = await archived.execute<{
		issue: { archivedAt?: string | null };
	}>("get_issue", context(), { issueId: "issue-1" });
	assert.equal(archivedResult.data.issue.archivedAt, NOW);

	const listed = await active.execute<{
		items: { archivedAt?: string | null }[];
	}>("list_issues", context(), {});
	assert.equal(listed.data.items[0]?.archivedAt, null);
});

test("list_orgs returns the actor's memberships and works without an org", async () => {
	const { deps } = setup({ role: "admin" });
	const layer = createCapabilityLayer(deps);
	const result = await layer.execute<{
		orgs: { id: string; role?: string }[];
	}>("list_orgs", context({ orgId: undefined }), {});
	assert.deepEqual(result.data.orgs, [
		{ id: ORG_ID, name: "Acme", slug: "acme", frozen: false, role: "admin" },
	]);
});

test("output schemas drop sensitive or unknown fields", async () => {
	const { deps } = setup();
	const layer = createCapabilityLayer(deps);
	const result = await layer.execute<Record<string, unknown>>(
		"get_project",
		context(),
		{ projectId: "project-1" },
	);
	const project = result.data.project as Record<string, unknown>;
	assert.equal(project.key, "WEB");
	assert.equal("stripeCustomerId" in project, false);
	assert.equal("nextNumber" in project, true);
});

test("create_issue returns a curated issue and schedules background work", async () => {
	const { deps, calls } = setup();
	const layer = createCapabilityLayer(deps);
	const result = await layer.execute<{
		issue: Record<string, unknown>;
	}>("create_issue", context(), {
		projectId: "project-1",
		title: "Login fails",
		status: "todo",
		priority: 2,
	});
	assert.equal(result.data.issue.number, 7);
	assert.equal(result.summary.includes("Login fails"), true);
	assert.equal(
		result.links[0]?.url,
		"https://app.example.com/orgs/org-1/projects/project-1/7",
	);
	assert.deepEqual(calls.createIssue, [
		{ orgId: ORG_ID, projectId: "project-1", userId: USER_ID },
	]);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(calls.backgroundTasks, 1);
});

test("invalid capability input is rejected before the service runs", async () => {
	const { deps, calls } = setup();
	const layer = createCapabilityLayer(deps);
	await assert.rejects(
		layer.execute("get_issue", context(), {}),
		isApiError(ApiErrorCode.VALIDATION, 400),
	);
	assert.equal(calls.listIssues.length, 0);
});

test("AI provider fails closed when openai-compatible config is incomplete", () => {
	assert.throws(
		() => createAiProvider({ AI_PROVIDER: "openai-compatible" }),
		isApiError(ApiErrorCode.AI_NOT_CONFIGURED, 503),
	);
	assert.throws(
		() =>
			createAiProvider({
				AI_PROVIDER: "openai-compatible",
				AI_BASE_URL: "https://api.example.com/v1",
				AI_API_KEY: "test-key",
				AI_MODEL: "model-a",
				AI_MODEL_ALLOWLIST: "model-b",
			}),
		isApiError(ApiErrorCode.AI_NOT_CONFIGURED, 503),
	);
});

test("mock AI provider is configured and generates offline", async () => {
	const provider = createAiProvider({});
	assert.equal(provider.info.mock, true);
	assert.equal(provider.info.configured, true);
	assert.equal(provider.info.kind, "mock");

	const generated = await generateText({
		model: provider.languageModel,
		prompt: "hello",
	});
	assert.equal(generated.text.includes("Mock AI reply"), true);

	const streamed = streamText({
		model: provider.languageModel,
		prompt: "hello",
	});
	let text = "";
	for await (const chunk of streamed.textStream) {
		text += chunk;
	}
	assert.equal(text.includes("Mock AI reply"), true);
});
