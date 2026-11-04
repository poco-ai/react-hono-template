import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	createFavoriteSchema,
} from "@workspace/shared";
import { drizzle } from "drizzle-orm/bun-sqlite";
import {
	type CapabilityDeps,
	createCapabilityRegistry,
} from "../src/capabilities";
import { createFavoriteDao } from "../src/dao/favorite.dao";
import { createIssueDao } from "../src/dao/issue.dao";
import { createProjectDao } from "../src/dao/project.dao";
import type { Database as AppDatabase } from "../src/db/types";
import type { Dependencies } from "../src/dependencies";
import type { Auth } from "../src/lib/auth";
import { createRoutes } from "../src/routes";
import { createFavoriteService } from "../src/services/favorite.service";

/**
 * Favorites: owner scoping, idempotent add/remove, visibility validation
 * (same org, not deleted/archived) and hydration of issue/project summaries.
 */

const ORG = "org";
const OTHER_ORG = "org-2";
const PROJECT = "p1";
const OTHER_PROJECT = "p2";
const ARCHIVED_PROJECT = "p3";
const USER = "user-1";
const OTHER_USER = "user-2";

const DDL = `
CREATE TABLE projects (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	name text NOT NULL,
	key text NOT NULL,
	description text,
	color text,
	archived integer NOT NULL DEFAULT 0,
	next_number integer NOT NULL DEFAULT 1,
	health text,
	target_date integer,
	lead_id text,
	created_at integer NOT NULL DEFAULT 0,
	updated_at integer NOT NULL DEFAULT 0
);
CREATE TABLE issue_statuses (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	name text NOT NULL,
	category text NOT NULL,
	color text NOT NULL DEFAULT '#000000',
	position integer NOT NULL DEFAULT 0,
	is_default integer NOT NULL DEFAULT 0,
	created_at integer NOT NULL DEFAULT 0,
	updated_at integer NOT NULL DEFAULT 0
);
CREATE TABLE issues (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	project_id text NOT NULL,
	number integer NOT NULL,
	title text NOT NULL,
	description text,
	parent_id text,
	cycle_id text,
	status_id text NOT NULL,
	priority integer NOT NULL DEFAULT 0,
	assignee_id text,
	created_by_id text,
	due_date integer,
	estimate integer,
	deleted_at integer,
	archived_at integer,
	created_at integer NOT NULL DEFAULT 0,
	updated_at integer NOT NULL DEFAULT 0
);
CREATE TABLE favorites (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	user_id text NOT NULL,
	entity_type text NOT NULL,
	entity_id text NOT NULL,
	created_at integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX favorites_userId_entityType_entityId_uq
	ON favorites (user_id, entity_type, entity_id);
`;

const setup = () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(DDL);
	for (const [id, orgId, key, archived, health] of [
		[PROJECT, ORG, "WEB", 0, "on_track"],
		[OTHER_PROJECT, ORG, "API", 0, null],
		[ARCHIVED_PROJECT, ORG, "OLD", 1, null],
		["p-other-org", OTHER_ORG, "OTH", 0, null],
	] as const) {
		sqlite.run(
			"INSERT INTO projects (id, org_id, name, key, archived, health, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0)",
			id,
			orgId,
			`Project ${id}`,
			key,
			archived,
			health,
		);
	}
	for (const [id, orgId, name, category] of [
		["s-backlog", ORG, "Backlog", "backlog"],
		["s-done", ORG, "Done", "completed"],
	] as const) {
		sqlite.run(
			"INSERT INTO issue_statuses (id, org_id, name, category) VALUES (?, ?, ?, ?)",
			id,
			orgId,
			name,
			category,
		);
	}
	const addIssue = (
		id: string,
		projectId: string,
		number: number,
		options: {
			orgId?: string;
			statusId?: string;
			deletedAt?: number | null;
			archivedAt?: number | null;
		} = {},
	) =>
		sqlite.run(
			"INSERT INTO issues (id, org_id, project_id, number, title, status_id, deleted_at, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)",
			id,
			options.orgId ?? ORG,
			projectId,
			number,
			`Issue ${id}`,
			options.statusId ?? "s-backlog",
			options.deletedAt ?? null,
			options.archivedAt ?? null,
		);
	addIssue("i1", PROJECT, 1);
	addIssue("i-done", PROJECT, 2, { statusId: "s-done" });
	addIssue("i-archived", PROJECT, 3, { archivedAt: 1_700_000_000_000 });
	addIssue("i-deleted", PROJECT, 4, { deletedAt: 1_700_000_000_000 });
	addIssue("i-other-org", "p-other-org", 1, {
		orgId: OTHER_ORG,
		statusId: "s-backlog",
	});

	const db = Object.assign(drizzle({ client: sqlite }), {
		batch: async (statements: unknown[]) => {
			const results: unknown[] = [];
			for (const statement of statements) {
				results.push(await statement);
			}
			return results;
		},
	}) as unknown as AppDatabase;
	const favoriteDao = createFavoriteDao(db);
	const issueDao = createIssueDao(db);
	const projectDao = createProjectDao(db);
	const favoriteService = createFavoriteService({
		favoriteDao,
		issueDao,
		projectDao,
	});
	return { sqlite, favoriteDao, favoriteService };
};

const isApiError = (status: number, code: ApiErrorCode) => (error: unknown) =>
	error instanceof ApiError && error.status === status && error.code === code;

test("favoriting an issue hydrates project key, number, title and status", async () => {
	const { favoriteService } = setup();
	const favorite = await favoriteService.addFavorite(ORG, USER, {
		entityType: "issue",
		entityId: "i1",
	});
	assert.equal(favorite.entityType, "issue");
	assert.equal(favorite.issue?.projectKey, "WEB");
	assert.equal(favorite.issue?.number, 1);
	assert.equal(favorite.issue?.identifier, "WEB-1");
	assert.equal(favorite.issue?.title, "Issue i1");
	assert.equal(favorite.issue?.statusName, "Backlog");
	assert.equal(favorite.issue?.statusCategory, "backlog");
	assert.equal(favorite.project, null);

	const done = await favoriteService.addFavorite(ORG, USER, {
		entityType: "issue",
		entityId: "i-done",
	});
	assert.equal(done.issue?.statusName, "Done");
	assert.equal(done.issue?.statusCategory, "completed");
});

test("favoriting is idempotent for issues and projects", async () => {
	const { sqlite, favoriteService } = setup();
	const first = await favoriteService.addFavorite(ORG, USER, {
		entityType: "issue",
		entityId: "i1",
	});
	const second = await favoriteService.addFavorite(ORG, USER, {
		entityType: "issue",
		entityId: "i1",
	});
	assert.equal(first.id, second.id);
	assert.equal(
		(
			sqlite.query("SELECT count(*) AS count FROM favorites").get() as {
				count: number;
			}
		).count,
		1,
	);

	const project = await favoriteService.addFavorite(ORG, USER, {
		entityType: "project",
		entityId: PROJECT,
	});
	assert.equal(project.project?.name, "Project p1");
	assert.equal(project.project?.health, "on_track");
	assert.equal(project.issue, null);

	const list = await favoriteService.listFavorites(ORG, USER);
	assert.deepEqual(
		list.map((item) => `${item.entityType}:${item.entityId}`).sort(),
		["issue:i1", "project:p1"],
	);
});

test("favorites are owner-scoped", async () => {
	const { favoriteService } = setup();
	await favoriteService.addFavorite(ORG, USER, {
		entityType: "issue",
		entityId: "i1",
	});
	assert.deepEqual(await favoriteService.listFavorites(ORG, OTHER_USER), []);
	// Another member cannot delete someone else's favorite (404-free no-op).
	assert.deepEqual(
		await favoriteService.removeFavorite(ORG, OTHER_USER, "issue", "i1"),
		{ removed: false },
	);
	assert.equal((await favoriteService.listFavorites(ORG, USER)).length, 1);
});

test("favoriting rejects cross-org, missing, deleted and archived entities", async () => {
	const { favoriteService } = setup();
	await assert.rejects(
		favoriteService.addFavorite(ORG, USER, {
			entityType: "issue",
			entityId: "i-other-org",
		}),
		isApiError(404, ApiErrorCode.ISSUE_NOT_FOUND),
	);
	await assert.rejects(
		favoriteService.addFavorite(ORG, USER, {
			entityType: "issue",
			entityId: "missing",
		}),
		isApiError(404, ApiErrorCode.ISSUE_NOT_FOUND),
	);
	await assert.rejects(
		favoriteService.addFavorite(ORG, USER, {
			entityType: "issue",
			entityId: "i-deleted",
		}),
		isApiError(404, ApiErrorCode.ISSUE_NOT_FOUND),
	);
	await assert.rejects(
		favoriteService.addFavorite(ORG, USER, {
			entityType: "issue",
			entityId: "i-archived",
		}),
		isApiError(409, ApiErrorCode.CONFLICT),
	);
	await assert.rejects(
		favoriteService.addFavorite(ORG, USER, {
			entityType: "project",
			entityId: "p-other-org",
		}),
		isApiError(404, ApiErrorCode.PROJECT_NOT_FOUND),
	);
	await assert.rejects(
		favoriteService.addFavorite(ORG, USER, {
			entityType: "project",
			entityId: ARCHIVED_PROJECT,
		}),
		isApiError(409, ApiErrorCode.CONFLICT),
	);
});

test("removing a favorite is idempotent", async () => {
	const { favoriteService } = setup();
	await favoriteService.addFavorite(ORG, USER, {
		entityType: "project",
		entityId: PROJECT,
	});
	assert.deepEqual(
		await favoriteService.removeFavorite(ORG, USER, "project", PROJECT),
		{ removed: true },
	);
	assert.deepEqual(
		await favoriteService.removeFavorite(ORG, USER, "project", PROJECT),
		{ removed: false },
	);
	assert.deepEqual(await favoriteService.listFavorites(ORG, USER), []);
});

test("archiving a favorited issue drops it from the hydrated list", async () => {
	const { sqlite, favoriteService } = setup();
	await favoriteService.addFavorite(ORG, USER, {
		entityType: "issue",
		entityId: "i1",
	});
	sqlite.run("UPDATE issues SET archived_at = 1 WHERE id = 'i1'");
	assert.deepEqual(await favoriteService.listFavorites(ORG, USER), []);
});

test("the favorite input schema only accepts issue/project", () => {
	assert.equal(
		createFavoriteSchema.safeParse({ entityType: "issue", entityId: "i1" })
			.success,
		true,
	);
	assert.equal(
		createFavoriteSchema.safeParse({ entityType: "comment", entityId: "c1" })
			.success,
		false,
	);
});

test("list_favorites is registered as a read capability", () => {
	const deps = {
		services: {
			favoriteService: {
				listFavorites: async () => [],
			},
			issueTemplateService: {
				listTemplates: async () => [],
			},
		},
		daos: {},
	} as unknown as CapabilityDeps;
	const registry = createCapabilityRegistry(deps);
	const entry = registry.find((item) => item.name === "list_favorites");
	assert.equal(entry?.effect, "read");
	assert.deepEqual(entry?.scopes, ["read"]);
	assert.equal(entry?.orgScoped, undefined);
});

test("hydrating 150+ favorites chunks id lookups under D1's limit", async () => {
	const { sqlite, favoriteService } = setup();
	const issueCount = 150;
	const projectCount = 120;
	for (let index = 0; index < issueCount; index++) {
		sqlite.run(
			"INSERT INTO issues (id, org_id, project_id, number, title, status_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 's-backlog', 0, 0)",
			`fi-${index}`,
			ORG,
			PROJECT,
			100 + index,
			`Favorite issue ${index}`,
		);
		sqlite.run(
			"INSERT INTO favorites (id, org_id, user_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, 'issue', ?, 0)",
			`f-issue-${index}`,
			ORG,
			USER,
			`fi-${index}`,
		);
	}
	for (let index = 0; index < projectCount; index++) {
		sqlite.run(
			"INSERT INTO projects (id, org_id, name, key, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0)",
			`fp-${index}`,
			ORG,
			`Favorite project ${index}`,
			`FP${index}`,
		);
		sqlite.run(
			"INSERT INTO favorites (id, org_id, user_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, 'project', ?, 0)",
			`f-project-${index}`,
			ORG,
			USER,
			`fp-${index}`,
		);
	}

	const list = await favoriteService.listFavorites(ORG, USER);
	assert.equal(list.length, issueCount + projectCount);
	assert.equal(
		list.filter((item) => item.entityType === "issue").length,
		issueCount,
	);
	assert.equal(
		list.filter((item) => item.entityType === "project").length,
		projectCount,
	);
	// Issue favorites still resolve their project key.
	assert.ok(
		list.every(
			(item) => item.entityType !== "issue" || item.issue?.projectKey === "WEB",
		),
	);
});

// ---------------------------------------------------------------------------
// Route middleware: org scoping and freeze handling
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
			getSession: async () => ({ user: { id: USER, role: "user" } }),
		},
	} as unknown as Auth;
	const favorites: unknown[] = [];
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
				getConfig: async () => ({}),
				updateConfig: async (input: unknown) => input,
			},
			mediaService: {
				getMedia: async () => null,
				presignAvatar: async () => null,
				presignOrgLogo: async () => null,
			},
			favoriteService: {
				listFavorites: async () => favorites,
				addFavorite: async (orgId: string, userId: string, input: unknown) => {
					favorites.push(input);
					return { id: "fav-1", orgId, userId };
				},
				removeFavorite: async () => ({ removed: true }),
			},
		},
	} as unknown as Dependencies;
	return createRoutes({ auth, dependencies });
};

test("favorite routes are org-scoped and frozen organizations cannot write", async () => {
	const nonMember = appFor({ member: false });
	assert.equal(
		(await nonMember.request("/api/orgs/org/favorites")).status,
		404,
	);

	const member = appFor();
	const list = await member.request("/api/orgs/org/favorites");
	assert.equal(list.status, 200);
	const body = (await list.json()) as { ok: boolean; data: unknown[] };
	assert.deepEqual(body.data, []);

	const unknownType = await member.request(
		"/api/orgs/org/favorites/comment/c1",
		{ method: "DELETE" },
	);
	assert.equal(unknownType.status, 400);

	const frozen = appFor({ frozen: true });
	const blocked = await frozen.request("/api/orgs/org/favorites", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ entityType: "issue", entityId: "i1" }),
	});
	assert.equal(blocked.status, 403);
	const blockedBody = (await blocked.json()) as { error: { code: string } };
	assert.equal(blockedBody.error.code, "ORG_FROZEN");
});
