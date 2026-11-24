import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	createIssueTemplateSchema,
	updateIssueTemplateSchema,
} from "@workspace/shared";
import type { Auth } from "../src/core/lib/auth";
import type { Dependencies } from "../src/dependencies";
import {
	type CapabilityDeps,
	createCapabilityRegistry,
} from "../src/features/capabilities/index";
import { createLabelDao } from "../src/features/labels/dao/label.dao";
import { createProjectDao } from "../src/features/projects/dao/project.dao";
import { createStatusDao } from "../src/features/statuses/dao/status.dao";
import { createIssueTemplateDao } from "../src/features/templates/dao/issue-template.dao";
import { createIssueTemplateService } from "../src/features/templates/services/issue-template.service";
import { createRoutes } from "../src/routes";
import { seedProject, seedStatus } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

/**
 * Issue templates: CRUD, name uniqueness per (organization, project) scope,
 * organization-level templates, cross-organization project/status/label
 * validation and owner/admin write permissions.
 */

const ORG = "org";
const OTHER_ORG = "org-2";
const PROJECT = "p1";
const OTHER_PROJECT = "p2";
const USER = "user-1";

const setup = () => {
	const { sqlite, db } = createTestDb();
	for (const [id, orgId, key] of [
		[PROJECT, ORG, "WEB"],
		[OTHER_PROJECT, ORG, "API"],
		["p-other-org", OTHER_ORG, "OTH"],
	] as const) {
		seedProject(sqlite, { id, orgId, key, name: `Project ${id}` });
	}
	for (const [id, orgId, name] of [
		["s-backlog", ORG, "Backlog"],
		["s-todo", ORG, "Todo"],
		["s-other-org", OTHER_ORG, "Other"],
	] as const) {
		seedStatus(sqlite, { id, orgId, name });
	}
	for (const [id, orgId, name] of [
		["l1", ORG, "bug"],
		["l2", ORG, "frontend"],
		["l-other-org", OTHER_ORG, "foreign"],
	] as const) {
		sqlite.run(
			"INSERT INTO labels (id, org_id, name) VALUES (?, ?, ?)",
			id,
			orgId,
			name,
		);
	}

	const templateDao = createIssueTemplateDao(db);
	const service = createIssueTemplateService({
		templateDao,
		projectDao: createProjectDao(db),
		statusDao: createStatusDao(db),
		labelDao: createLabelDao(db),
	});
	return { sqlite, templateDao, service };
};

const isApiError = (status: number, code: ApiErrorCode) => (error: unknown) =>
	error instanceof ApiError && error.status === status && error.code === code;

const baseInput = {
	name: "Bug report",
	title: "Describe the bug",
	description: "Steps to reproduce",
};

test("create stores an organization-wide template and dedupes labels", async () => {
	const { service } = setup();
	const template = await service.createTemplate(ORG, USER, {
		...baseInput,
		statusId: "s-backlog",
		priority: 2,
		labelIds: ["l1", "l1", "l2"],
		estimate: 3,
	});
	assert.equal(template.projectId, null);
	assert.equal(template.statusId, "s-backlog");
	assert.equal(template.priority, 2);
	assert.deepEqual(template.labelIds, ["l1", "l2"]);
	assert.equal(template.estimate, 3);
	assert.equal(template.createdById, USER);
	assert.deepEqual(
		(await service.listTemplates(ORG)).map((item) => item.name),
		["Bug report"],
	);
});

test("templates can be scoped to a project and filtered by projectId", async () => {
	const { service } = setup();
	await service.createTemplate(ORG, USER, { ...baseInput, name: "Org level" });
	await service.createTemplate(ORG, USER, {
		...baseInput,
		name: "Web level",
		projectId: PROJECT,
	});
	await service.createTemplate(ORG, USER, {
		...baseInput,
		name: "Api level",
		projectId: OTHER_PROJECT,
	});
	const all = await service.listTemplates(ORG);
	assert.deepEqual(
		all.map((item) => item.name),
		["Api level", "Org level", "Web level"],
	);
	const web = await service.listTemplates(ORG, { projectId: PROJECT });
	assert.deepEqual(
		web.map((item) => item.name),
		["Web level"],
	);
});

test("template names are unique per organization+project scope", async () => {
	const { service } = setup();
	await service.createTemplate(ORG, USER, {
		...baseInput,
		name: "Shared",
		projectId: PROJECT,
	});
	// Same name in another project is fine.
	await service.createTemplate(ORG, USER, {
		...baseInput,
		name: "Shared",
		projectId: OTHER_PROJECT,
	});
	await assert.rejects(
		service.createTemplate(ORG, USER, {
			...baseInput,
			name: "Shared",
			projectId: PROJECT,
		}),
		isApiError(409, ApiErrorCode.CONFLICT),
	);
	// Organization-wide templates have their own namespace.
	await service.createTemplate(ORG, USER, { ...baseInput, name: "Shared" });
	await assert.rejects(
		service.createTemplate(ORG, USER, { ...baseInput, name: "Shared" }),
		isApiError(409, ApiErrorCode.CONFLICT),
	);
	// The org-level "Shared" does not collide with the project-scoped one.
	assert.equal((await service.listTemplates(ORG)).length, 3);
});

test("project, status and label references must belong to the organization", async () => {
	const { service } = setup();
	await assert.rejects(
		service.createTemplate(ORG, USER, {
			...baseInput,
			projectId: "p-other-org",
		}),
		isApiError(404, ApiErrorCode.PROJECT_NOT_FOUND),
	);
	await assert.rejects(
		service.createTemplate(ORG, USER, {
			...baseInput,
			statusId: "s-other-org",
		}),
		isApiError(404, ApiErrorCode.STATUS_NOT_FOUND),
	);
	await assert.rejects(
		service.createTemplate(ORG, USER, {
			...baseInput,
			labelIds: ["l1", "l-other-org"],
		}),
		isApiError(404, ApiErrorCode.LABEL_NOT_FOUND),
	);
	await assert.rejects(
		service.createTemplate(ORG, USER, {
			...baseInput,
			projectId: "missing",
		}),
		isApiError(404, ApiErrorCode.PROJECT_NOT_FOUND),
	);
});

test("update renames, moves to org scope and clears optional fields", async () => {
	const { service } = setup();
	const created = await service.createTemplate(ORG, USER, {
		...baseInput,
		projectId: PROJECT,
		statusId: "s-todo",
		priority: 1,
		labelIds: ["l1"],
		estimate: 5,
	});
	const updated = await service.updateTemplate(ORG, created.id, {
		name: "Renamed",
		projectId: null,
		statusId: null,
		priority: null,
		labelIds: [],
		estimate: null,
		description: null,
	});
	assert.equal(updated.name, "Renamed");
	assert.equal(updated.projectId, null);
	assert.equal(updated.statusId, null);
	assert.equal(updated.priority, null);
	assert.deepEqual(updated.labelIds, []);
	assert.equal(updated.estimate, null);
	assert.equal(updated.description, null);
	assert.equal(updated.title, baseInput.title);
});

test("update rejects a name already used in the target scope", async () => {
	const { service } = setup();
	await service.createTemplate(ORG, USER, { ...baseInput, name: "First" });
	const second = await service.createTemplate(ORG, USER, {
		...baseInput,
		name: "Second",
	});
	await assert.rejects(
		service.updateTemplate(ORG, second.id, { name: "First" }),
		isApiError(409, ApiErrorCode.CONFLICT),
	);
	// Renaming to its own name is allowed.
	const same = await service.updateTemplate(ORG, second.id, {
		name: "Second",
	});
	assert.equal(same.name, "Second");
});

test("delete removes the template; missing ids are 404", async () => {
	const { service } = setup();
	const created = await service.createTemplate(ORG, USER, baseInput);
	await service.deleteTemplate(ORG, created.id);
	assert.deepEqual(await service.listTemplates(ORG), []);
	await assert.rejects(
		service.deleteTemplate(ORG, created.id),
		isApiError(404, ApiErrorCode.NOT_FOUND),
	);
	await assert.rejects(
		service.updateTemplate(ORG, "missing", { name: "x" }),
		isApiError(404, ApiErrorCode.NOT_FOUND),
	);
});

test("templates are org-scoped: another org cannot see or mutate them", async () => {
	const { service } = setup();
	const created = await service.createTemplate(ORG, USER, baseInput);
	assert.deepEqual(await service.listTemplates(OTHER_ORG), []);
	await assert.rejects(
		service.updateTemplate(OTHER_ORG, created.id, { name: "Stolen" }),
		isApiError(404, ApiErrorCode.NOT_FOUND),
	);
	await assert.rejects(
		service.deleteTemplate(OTHER_ORG, created.id),
		isApiError(404, ApiErrorCode.NOT_FOUND),
	);
});

test("template schemas validate priority, label count and partial updates", () => {
	assert.equal(
		createIssueTemplateSchema.safeParse({ name: "T", title: "Title" }).success,
		true,
	);
	assert.equal(
		createIssueTemplateSchema.safeParse({ name: "", title: "Title" }).success,
		false,
	);
	assert.equal(
		createIssueTemplateSchema.safeParse({
			name: "T",
			title: "Title",
			priority: 9,
		}).success,
		false,
	);
	assert.equal(
		updateIssueTemplateSchema.safeParse({ description: null }).success,
		true,
	);
});

test("list_issue_templates is registered as a read capability", () => {
	const deps = {
		services: {
			favoriteService: { listFavorites: async () => [] },
			issueTemplateService: { listTemplates: async () => [] },
		},
		daos: {},
	} as unknown as CapabilityDeps;
	const entry = createCapabilityRegistry(deps).find(
		(item) => item.name === "list_issue_templates",
	);
	assert.equal(entry?.effect, "read");
	assert.deepEqual(entry?.scopes, ["read"]);
});

// ---------------------------------------------------------------------------
// Route middleware: roles, org scoping and freeze handling
// ---------------------------------------------------------------------------

const appFor = ({
	member = true,
	frozen = false,
	role = "member",
}: {
	member?: boolean;
	frozen?: boolean;
	role?: string;
} = {}) => {
	const auth = {
		api: {
			getSession: async () => ({ user: { id: USER, role: "user" } }),
		},
	} as unknown as Auth;
	const templates: Record<string, unknown>[] = [];
	const dependencies = {
		daos: {
			memberDao: {
				findByOrgAndUser: async () => (member ? { role, frozen } : null),
			},
		},
		services: {
			bootstrapService: { getBootstrap: async () => ({ hasAdmin: true }) },
			projectService: { listProjects: async () => [] },
			issueService: { listIssues: async () => ({ items: [] }) },
			billingService: { createCheckout: async () => ({ url: null }) },
			adminOrgService: { stats: async () => ({}) },
			configService: {
				getConfig: async () => ({}),
				updateConfig: async (input: unknown) => input,
			},
			mediaService: {
				getMedia: async () => null,
				presignAvatar: async () => null,
				presignOrgLogo: async () => null,
			},
			issueTemplateService: {
				listTemplates: async () => templates,
				createTemplate: async (
					orgId: string,
					userId: string,
					input: Record<string, unknown>,
				) => {
					const created = { id: `tpl-${templates.length + 1}`, ...input };
					templates.push(created);
					return { ...created, orgId, createdById: userId };
				},
				updateTemplate: async (
					_orgId: string,
					id: string,
					input: Record<string, unknown>,
				) => ({ id, ...input }),
				deleteTemplate: async () => undefined,
			},
		},
	} as unknown as Dependencies;
	return createRoutes({ auth, dependencies });
};

test("template GET is member-readable and scoped to the organization", async () => {
	const nonMember = appFor({ member: false });
	assert.equal(
		(await nonMember.request("/api/orgs/org/issue-templates")).status,
		404,
	);
	const member = appFor();
	const response = await member.request("/api/orgs/org/issue-templates");
	assert.equal(response.status, 200);
	const body = (await response.json()) as { ok: boolean; data: unknown[] };
	assert.deepEqual(body.data, []);
});

test("template writes require owner or admin", async () => {
	const payload = { name: "T", title: "Title" };
	const member = appFor();
	const create = await member.request("/api/orgs/org/issue-templates", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});
	assert.equal(create.status, 403);
	const update = await member.request("/api/orgs/org/issue-templates/tpl-1", {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: "Renamed" }),
	});
	assert.equal(update.status, 403);
	const remove = await member.request("/api/orgs/org/issue-templates/tpl-1", {
		method: "DELETE",
	});
	assert.equal(remove.status, 403);

	const admin = appFor({ role: "admin" });
	const created = await admin.request("/api/orgs/org/issue-templates", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});
	assert.equal(created.status, 200);
});

test("frozen organizations can read templates but not write them", async () => {
	const frozen = appFor({ role: "admin", frozen: true });
	assert.equal(
		(await frozen.request("/api/orgs/org/issue-templates")).status,
		200,
	);
	const blocked = await frozen.request("/api/orgs/org/issue-templates", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: "T", title: "Title" }),
	});
	assert.equal(blocked.status, 403);
	const body = (await blocked.json()) as { error: { code: string } };
	assert.equal(body.error.code, "ORG_FROZEN");
});
