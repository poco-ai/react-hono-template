import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	createProjectUpdateSchema,
	DEFAULT_RUNTIME_CONFIG,
	PROJECT_UPDATE_BODY_MAX,
	updateProjectSchema,
	updateProjectUpdateSchema,
} from "@workspace/shared";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { ProjectDao } from "../src/dao/project.dao";
import type { ProjectUpdateDao } from "../src/dao/project-update.dao";
import { createProjectUpdateDao } from "../src/dao/project-update.dao";
import type { Database as AppDatabase } from "../src/db/types";
import type { Dependencies } from "../src/dependencies";
import type { ProjectDto } from "../src/dto/project.dto";
import type { ProjectUpdateDto } from "../src/dto/project-update.dto";
import type { Auth } from "../src/lib/auth";
import { createRoutes } from "../src/routes";
import type { PlanService } from "../src/services/plan.service";
import { createProjectService } from "../src/services/project.service";
import { createProjectUpdateService } from "../src/services/project-update.service";

const ORG = "org";
const PROJECT = "project-1";
const NOW = "2026-06-01T00:00:00.000Z";

const updateDto = (
	overrides: Partial<ProjectUpdateDto> = {},
): ProjectUpdateDto => ({
	id: "update-1",
	orgId: ORG,
	projectId: PROJECT,
	authorId: "author-1",
	body: "On track for the beta.",
	health: "on_track",
	createdAt: NOW,
	updatedAt: NOW,
	author: {
		id: "author-1",
		name: "Ada",
		email: "ada@example.com",
		image: null,
	},
	...overrides,
});

const projectDto = (): ProjectDto => ({
	id: PROJECT,
	orgId: ORG,
	name: "Website",
	key: "WEB",
	description: null,
	color: null,
	archived: false,
	nextNumber: 1,
	health: null,
	targetDate: null,
	leadId: null,
	createdAt: NOW,
	updatedAt: NOW,
});

const projectDaoStub = (project: ProjectDto | null = projectDto()) =>
	({ findById: async () => project }) as unknown as ProjectDao;

const updateServiceFor = ({
	existing = updateDto(),
	project = projectDto(),
	patches = [] as Record<string, unknown>[],
	created = [] as Record<string, unknown>[],
	deleted = [] as string[],
} = {}) => {
	const dao = {
		listByProject: async () => ({
			items: existing ? [existing] : [],
			total: existing ? 1 : 0,
			page: 1,
			pageSize: 20,
		}),
		findForProject: async () => existing,
		create: async (data: Record<string, unknown>) => {
			created.push(data);
			return updateDto({ ...data, authorId: data.authorId as string });
		},
		update: async (
			_orgId: string,
			_projectId: string,
			_id: string,
			patch: Record<string, unknown>,
		) => {
			patches.push(patch);
			return updateDto({
				...patch,
				body: (patch.body as string) ?? existing.body,
			});
		},
		delete: async (_orgId: string, _projectId: string, id: string) => {
			deleted.push(id);
			return true;
		},
	} as unknown as ProjectUpdateDao;
	return {
		service: createProjectUpdateService({
			updateDao: dao,
			projectDao: projectDaoStub(project),
		}),
		patches,
		created,
		deleted,
	};
};

const isApiError = (status: number, code: ApiErrorCode) => (error: unknown) =>
	error instanceof ApiError && error.status === status && error.code === code;

test("project update schemas enforce body length and health values", () => {
	assert.equal(
		createProjectUpdateSchema.safeParse({ body: "A status update" }).success,
		true,
	);
	assert.equal(
		createProjectUpdateSchema.safeParse({
			body: "Update",
			health: "at_risk",
		}).success,
		true,
	);
	assert.equal(
		createProjectUpdateSchema.safeParse({ body: "" }).success,
		false,
	);
	assert.equal(
		createProjectUpdateSchema.safeParse({
			body: "x".repeat(PROJECT_UPDATE_BODY_MAX + 1),
		}).success,
		false,
	);
	assert.equal(
		createProjectUpdateSchema.safeParse({ body: "x", health: "unknown" })
			.success,
		false,
	);
	assert.equal(
		updateProjectUpdateSchema.safeParse({ health: null }).success,
		true,
	);
});

test("project schema accepts lead, target date and health", () => {
	assert.equal(
		updateProjectSchema.safeParse({
			targetDate: "2026-09-01T00:00:00.000Z",
			leadId: "user-1",
			health: "off_track",
		}).success,
		true,
	);
	assert.equal(
		updateProjectSchema.safeParse({ health: "green" }).success,
		false,
	);
	assert.equal(
		updateProjectSchema.safeParse({ targetDate: "not-a-date" }).success,
		false,
	);
});

test("any member can post an update; author is recorded", async () => {
	const { service, created } = updateServiceFor();
	const update = await service.createUpdate(ORG, PROJECT, "member-1", {
		body: "Shipping soon",
		health: "on_track",
	});
	assert.equal(update.authorId, "member-1");
	assert.equal(created.length, 1);
	assert.equal(created[0]?.orgId, ORG);
	assert.equal(created[0]?.projectId, PROJECT);
	assert.equal(created[0]?.authorId, "member-1");
	assert.equal(created[0]?.health, "on_track");
});

test("creating an update requires an existing project", async () => {
	const { service } = updateServiceFor({ project: null as never });
	await assert.rejects(
		service.createUpdate(ORG, PROJECT, "member-1", { body: "Hi" }),
		isApiError(404, ApiErrorCode.PROJECT_NOT_FOUND),
	);
});

test("only the author or an org admin/owner can edit or delete an update", async () => {
	const other = updateServiceFor();
	await assert.rejects(
		other.service.updateUpdate(
			ORG,
			PROJECT,
			"update-1",
			{
				userId: "someone-else",
				role: "member",
			},
			{ body: "Changed" },
		),
		isApiError(403, ApiErrorCode.FORBIDDEN),
	);
	await assert.rejects(
		other.service.deleteUpdate(ORG, PROJECT, "update-1", {
			userId: "someone-else",
			role: "member",
		}),
		isApiError(403, ApiErrorCode.FORBIDDEN),
	);
	assert.equal(other.patches.length, 0);
	assert.equal(other.deleted.length, 0);

	const author = updateServiceFor();
	await author.service.updateUpdate(
		ORG,
		PROJECT,
		"update-1",
		{ userId: "author-1", role: "member" },
		{ body: "Changed", health: null },
	);
	assert.deepEqual(author.patches, [{ body: "Changed", health: null }]);

	for (const role of ["owner", "admin"]) {
		const moderator = updateServiceFor();
		await moderator.service.deleteUpdate(ORG, PROJECT, "update-1", {
			userId: "moderator-1",
			role,
		});
		assert.deepEqual(moderator.deleted, ["update-1"]);
	}
});

test("missing project updates are reported as 404", async () => {
	const { service } = updateServiceFor({ existing: null as never });
	await assert.rejects(
		service.updateUpdate(
			ORG,
			PROJECT,
			"missing",
			{ userId: "author-1", role: "member" },
			{ body: "Changed" },
		),
		isApiError(404, ApiErrorCode.PROJECT_UPDATE_NOT_FOUND),
	);
});

test("updateProject validates that the lead is an organization member", async () => {
	const patches: Record<string, unknown>[] = [];
	const dao = {
		findById: async () => projectDto(),
		findByKey: async () => null,
		update: async (
			_orgId: string,
			_id: string,
			patch: Record<string, unknown>,
		) => {
			patches.push(patch);
			return { ...projectDto(), ...patch };
		},
	} as unknown as ProjectDao;
	const service = createProjectService(
		dao,
		{} as PlanService,
		{ findByOrgAndUser: async () => undefined } as never,
	);
	await assert.rejects(
		service.updateProject(ORG, PROJECT, { leadId: "stranger" }),
		isApiError(400, ApiErrorCode.VALIDATION),
	);
	assert.equal(patches.length, 0);
});

test("updateProject persists lead, health and target date for members", async () => {
	const patches: Record<string, unknown>[] = [];
	const dao = {
		findById: async () => projectDto(),
		findByKey: async () => null,
		update: async (
			_orgId: string,
			_id: string,
			patch: Record<string, unknown>,
		) => {
			patches.push(patch);
			return {
				...projectDto(),
				health: patch.health as string | null,
				targetDate: (patch.targetDate as Date | null)?.toISOString() ?? null,
				leadId: patch.leadId as string | null,
			};
		},
	} as unknown as ProjectDao;
	const service = createProjectService(
		dao,
		{} as PlanService,
		{ findByOrgAndUser: async () => ({ role: "member" }) } as never,
	);
	const updated = await service.updateProject(ORG, PROJECT, {
		leadId: "member-1",
		health: "at_risk",
		targetDate: "2026-09-01T00:00:00.000Z",
	});
	assert.deepEqual(patches[0], {
		name: undefined,
		key: undefined,
		description: undefined,
		color: undefined,
		archived: undefined,
		health: "at_risk",
		targetDate: new Date("2026-09-01T00:00:00.000Z"),
		leadId: "member-1",
	});
	assert.equal(updated.health, "at_risk");
	assert.equal(updated.leadId, "member-1");
});

// ---------------------------------------------------------------------------
// Routes: org scoping, freeze guard, validation
// ---------------------------------------------------------------------------

const appFor = ({
	member = true,
	frozen = false,
}: {
	member?: boolean;
	frozen?: boolean;
} = {}) => {
	const auth = {
		api: {
			getSession: async () => ({ user: { id: "user", role: "user" } }),
		},
	} as unknown as Auth;
	const notUsed = async () => {
		throw new Error("service should not be called");
	};
	const dependencies = {
		daos: {
			memberDao: {
				findByOrgAndUser: async () =>
					member ? { role: "member", frozen } : null,
			},
		},
		services: {
			bootstrapService: { getBootstrap: async () => ({ hasAdmin: true }) },
			projectService: { listProjects: async () => [] },
			issueService: { listIssues: async () => ({ items: [] }) },
			billingService: { createCheckout: async () => ({ url: null }) },
			adminOrgService: { stats: async () => ({}) },
			configService: {
				getConfig: async () => DEFAULT_RUNTIME_CONFIG,
				updateConfig: async (input: unknown) => input,
			},
			mediaService: {
				getMedia: notUsed,
				presignAvatar: notUsed,
				presignOrgLogo: notUsed,
			},
			cycleService: {
				listCycles: async () => ({
					items: [],
					total: 0,
					page: 1,
					pageSize: 20,
				}),
				getCycle: notUsed,
				createCycle: notUsed,
				updateCycle: notUsed,
				deleteCycle: notUsed,
				rolloverCycle: notUsed,
			},
			projectUpdateService: {
				listUpdates: async () => ({
					items: [],
					total: 0,
					page: 1,
					pageSize: 20,
				}),
				createUpdate: notUsed,
				updateUpdate: notUsed,
				deleteUpdate: notUsed,
			},
		},
	} as unknown as Dependencies;
	return createRoutes({ auth, dependencies });
};

test("project update routes are org-scoped and respect the freeze guard", async () => {
	const nonMember = appFor({ member: false });
	assert.equal(
		(await nonMember.request("/api/orgs/org/projects/p/updates")).status,
		404,
	);

	const frozen = appFor({ frozen: true });
	assert.equal(
		(await frozen.request("/api/orgs/org/projects/p/updates")).status,
		200,
	);
	const blocked = await frozen.request("/api/orgs/org/projects/p/updates", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ body: "Update" }),
	});
	assert.equal(blocked.status, 403);
	const body = (await blocked.json()) as { error: { code: string } };
	assert.equal(body.error.code, "ORG_FROZEN");

	const member = appFor();
	const list = await member.request("/api/orgs/org/projects/p/updates");
	assert.equal(list.status, 200);
	const invalid = await member.request("/api/orgs/org/projects/p/updates", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ body: "Update", health: "great" }),
	});
	assert.equal(invalid.status, 400);
});

// ---------------------------------------------------------------------------
// DAO integration: author join, ordering and pagination totals
// ---------------------------------------------------------------------------

const UPDATE_DDL = `
CREATE TABLE user (
	id text PRIMARY KEY,
	name text NOT NULL,
	email text NOT NULL,
	image text
);
CREATE TABLE projects (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	health text,
	updated_at integer
);
CREATE TABLE project_updates (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	project_id text NOT NULL,
	author_id text,
	body text NOT NULL,
	health text,
	created_at integer NOT NULL DEFAULT 0,
	updated_at integer NOT NULL DEFAULT 0
);
`;

const daoSetup = () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(UPDATE_DDL);
	sqlite.run(
		"INSERT INTO projects (id, org_id, health) VALUES (?, ?, NULL)",
		PROJECT,
		ORG,
	);
	sqlite.run(
		"INSERT INTO user (id, name, email, image) VALUES ('u1', 'Ada', 'ada@example.com', NULL)",
	);
	sqlite.run(
		"INSERT INTO user (id, name, email, image) VALUES ('u2', 'Bo', 'bo@example.com', 'https://img.test/bo.png')",
	);
	sqlite.run(
		"INSERT INTO project_updates (id, org_id, project_id, author_id, body, health, created_at, updated_at) VALUES ('up1', ?, ?, 'u1', 'Older', 'on_track', 1000, 1000)",
		ORG,
		PROJECT,
	);
	sqlite.run(
		"INSERT INTO project_updates (id, org_id, project_id, author_id, body, health, created_at, updated_at) VALUES ('up2', ?, ?, 'u2', 'Newer', 'at_risk', 2000, 2000)",
		ORG,
		PROJECT,
	);
	sqlite.run(
		"INSERT INTO project_updates (id, org_id, project_id, author_id, body, health, created_at, updated_at) VALUES ('up3', ?, ?, NULL, 'Orphaned', NULL, 3000, 3000)",
		ORG,
		PROJECT,
	);
	const db = Object.assign(drizzle({ client: sqlite }), {
		batch: async (statements: unknown[]) => {
			const results: unknown[] = [];
			for (const statement of statements) {
				results.push(await statement);
			}
			return results;
		},
	});
	return { dao: createProjectUpdateDao(db as unknown as AppDatabase), sqlite };
};

test("project update dao lists newest first with author projections", async () => {
	const { dao } = daoSetup();
	const page = await dao.listByProject(ORG, PROJECT, { page: 1, pageSize: 20 });
	assert.equal(page.total, 3);
	assert.deepEqual(
		page.items.map((update) => update.id),
		["up3", "up2", "up1"],
	);
	assert.equal(page.items[0]?.author, null);
	assert.deepEqual(page.items[1]?.author, {
		id: "u2",
		name: "Bo",
		email: "bo@example.com",
		image: "https://img.test/bo.png",
	});
	const firstPage = await dao.listByProject(ORG, PROJECT, {
		page: 1,
		pageSize: 1,
	});
	assert.deepEqual(
		firstPage.items.map((update) => update.id),
		["up3"],
	);
	assert.equal(firstPage.total, 3);
	// Another organization's project is invisible.
	const other = await dao.listByProject("org-2", PROJECT, {
		page: 1,
		pageSize: 20,
	});
	assert.equal(other.total, 0);
});

test("project update dao writes, updates and deletes within the project scope", async () => {
	const { dao } = daoSetup();
	const created = await dao.create({
		id: "up4",
		orgId: ORG,
		projectId: PROJECT,
		authorId: "u1",
		body: "Fresh",
		health: null,
	});
	assert.equal(created.author?.name, "Ada");

	const updated = await dao.update(ORG, PROJECT, "up4", {
		body: "Edited",
		health: "off_track",
	});
	assert.equal(updated?.body, "Edited");
	assert.equal(updated?.health, "off_track");

	// Updates are scoped to their project.
	assert.equal(
		await dao.update(ORG, "other-project", "up4", { body: "x" }),
		null,
	);
	assert.equal(await dao.delete(ORG, "other-project", "up4"), false);
	assert.equal(await dao.delete(ORG, PROJECT, "up4"), true);
	assert.equal(await dao.findForProject(ORG, PROJECT, "up4"), null);
});

test("project update writes with health sync the project rollup", async () => {
	const { dao, sqlite } = daoSetup();
	const projectHealth = () =>
		(
			sqlite.query("SELECT health FROM projects WHERE id = ?").get(PROJECT) as {
				health: string | null;
			}
		).health;
	assert.equal(projectHealth(), null);

	// Creating a report with health writes the rollup in the same batch.
	await dao.create({
		id: "up4",
		orgId: ORG,
		projectId: PROJECT,
		authorId: "u1",
		body: "At risk",
		health: "at_risk",
	});
	assert.equal(projectHealth(), "at_risk");

	// Editing the report's health updates the rollup again.
	await dao.update(ORG, PROJECT, "up4", { health: "off_track" });
	assert.equal(projectHealth(), "off_track");

	// Reports without health leave the rollup untouched.
	await dao.create({
		id: "up5",
		orgId: ORG,
		projectId: PROJECT,
		authorId: "u1",
		body: "No health",
		health: null,
	});
	await dao.update(ORG, PROJECT, "up5", { body: "Still no health" });
	assert.equal(projectHealth(), "off_track");

	// Deleting a report does not roll health back.
	await dao.delete(ORG, PROJECT, "up4");
	assert.equal(projectHealth(), "off_track");
});
