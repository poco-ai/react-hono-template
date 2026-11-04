import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ApiError } from "@workspace/shared";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createCycleDao } from "../src/dao/cycle.dao";
import { createIssueDao } from "../src/dao/issue.dao";
import { createProjectDao } from "../src/dao/project.dao";
import { createSearchDao } from "../src/dao/search.dao";
import type { Database as AppDatabase } from "../src/db/types";
import type { Dependencies } from "../src/dependencies";
import type { Auth } from "../src/lib/auth";
import { buildSearchTerms } from "../src/lib/search";
import { createRoutes } from "../src/routes";
import { createIssueService } from "../src/services/issue.service";

/**
 * Issue archival: archived issues disappear from lists, FTS search (including
 * the short-token fallback), project statistics, cycle progress and sub-issue
 * progress, while the detail page and `restore` keep working. Also covers the
 * triage queue, which only returns backlog + unassigned + non-archived issues.
 */

const ORG = "org";
const OTHER_ORG = "org-2";
const PROJECT = "p1";
const API_PROJECT = "p2";
const OLD_PROJECT = "p3";
const OTHER_PROJECT = "p-other-org";
const USER = "user-1";
const NOW = 1_700_000_000_000;

const PARENT_DDL = `
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
CREATE TABLE cycles (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	project_id text NOT NULL,
	name text NOT NULL,
	number integer NOT NULL,
	starts_at integer NOT NULL,
	ends_at integer NOT NULL,
	created_by_id text,
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
CREATE TABLE issue_labels (
	issue_id text NOT NULL,
	label_id text NOT NULL,
	PRIMARY KEY (issue_id, label_id)
);
CREATE TABLE activities (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	project_id text NOT NULL,
	issue_id text NOT NULL,
	actor_id text NOT NULL,
	action text NOT NULL,
	field text,
	old_value text,
	new_value text,
	source text,
	source_id text,
	created_at integer NOT NULL DEFAULT 0
);
CREATE TABLE comments (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	issue_id text NOT NULL,
	author_id text NOT NULL,
	body text NOT NULL,
	created_at integer NOT NULL
);
CREATE TABLE user (
	id text PRIMARY KEY,
	name text NOT NULL,
	email text NOT NULL DEFAULT '',
	image text
);
`;

const FTS_SQL = readFileSync(
	fileURLToPath(new URL("../drizzle/fts/search_fts.sql", import.meta.url).href),
	"utf8",
);

const setup = () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(PARENT_DDL);
	sqlite.exec(FTS_SQL);
	for (const [id, orgId, name, key, archived] of [
		[PROJECT, ORG, "Web", "WEB", 0],
		[API_PROJECT, ORG, "Api", "API", 0],
		[OLD_PROJECT, ORG, "Old", "OLD", 1],
		[OTHER_PROJECT, OTHER_ORG, "Other", "OTH", 0],
	] as const) {
		sqlite.run(
			"INSERT INTO projects (id, org_id, name, key, archived) VALUES (?, ?, ?, ?, ?)",
			id,
			orgId,
			name,
			key,
			archived,
		);
	}
	for (const [id, category] of [
		["s-backlog", "backlog"],
		["s-todo", "unstarted"],
		["s-done", "completed"],
	] as const) {
		sqlite.run(
			"INSERT INTO issue_statuses (id, org_id, name, category) VALUES (?, ?, ?, ?)",
			id,
			ORG,
			id,
			category,
		);
	}
	sqlite.run(
		"INSERT INTO cycles (id, org_id, project_id, name, number, starts_at, ends_at) VALUES ('c1', ?, ?, 'Current', 1, 0, ?)",
		ORG,
		PROJECT,
		NOW * 2,
	);
	sqlite.run("INSERT INTO user (id, name) VALUES (?, 'User One')", USER);

	const addIssue = (
		id: string,
		projectId: string,
		number: number,
		title: string,
		options: {
			orgId?: string;
			statusId?: string;
			parentId?: string | null;
			cycleId?: string | null;
			assigneeId?: string | null;
			deletedAt?: number | null;
			archivedAt?: number | null;
			createdAt?: number;
		} = {},
	) =>
		sqlite.run(
			"INSERT INTO issues (id, org_id, project_id, number, title, status_id, parent_id, cycle_id, assignee_id, deleted_at, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			id,
			options.orgId ?? ORG,
			projectId,
			number,
			title,
			options.statusId ?? "s-backlog",
			options.parentId ?? null,
			options.cycleId ?? null,
			options.assigneeId ?? null,
			options.deletedAt ?? null,
			options.archivedAt ?? null,
			options.createdAt ?? 1000,
			options.createdAt ?? 1000,
		);
	addIssue("i1", PROJECT, 1, "Login timeout", {
		cycleId: "c1",
		createdAt: 1000,
	});
	addIssue("i2", PROJECT, 2, "Login crash", {
		statusId: "s-todo",
		parentId: "i1",
		cycleId: "c1",
		archivedAt: NOW,
		createdAt: 1100,
	});
	addIssue("i3", PROJECT, 3, "Search ranking", {
		parentId: "i1",
		createdAt: 1200,
	});
	addIssue("i4", PROJECT, 4, "Deleted issue", {
		deletedAt: NOW,
		createdAt: 1300,
	});
	addIssue("i5", OLD_PROJECT, 1, "Archived project issue", {
		createdAt: 1400,
	});
	addIssue("i6", API_PROJECT, 2, "Triage backlog", { createdAt: 1600 });
	addIssue("i7", API_PROJECT, 3, "Triage assigned", {
		assigneeId: USER,
		createdAt: 1700,
	});
	addIssue("i8", API_PROJECT, 4, "Triage todo", {
		statusId: "s-todo",
		createdAt: 1800,
	});
	addIssue("i9", OTHER_PROJECT, 1, "Other org issue", {
		orgId: OTHER_ORG,
		createdAt: 1900,
	});
	addIssue("i10", PROJECT, 5, "Archived triage", {
		archivedAt: NOW,
		createdAt: 2000,
	});
	addIssue("i11", PROJECT, 6, "Another backlog", { createdAt: 2100 });
	addIssue("i12", PROJECT, 7, "Done child", {
		statusId: "s-done",
		parentId: "i1",
		createdAt: 2200,
	});
	sqlite.run(
		"INSERT INTO comments (id, org_id, issue_id, author_id, body, created_at) VALUES ('c1', ?, 'i1', ?, 'login problem', 1)",
		ORG,
		USER,
	);
	sqlite.run(
		"INSERT INTO comments (id, org_id, issue_id, author_id, body, created_at) VALUES ('c2', ?, 'i2', ?, 'login crash again', 2)",
		ORG,
		USER,
	);

	const db = Object.assign(drizzle({ client: sqlite }), {
		batch: async (statements: unknown[]) => {
			const results: unknown[] = [];
			for (const statement of statements) {
				results.push(await statement);
			}
			return results;
		},
	}) as unknown as AppDatabase;
	const issueDao = createIssueDao(db);
	const projectDao = createProjectDao(db);
	const cycleDao = createCycleDao(db);
	const searchDao = createSearchDao(db);
	const issueService = createIssueService({
		issueDao,
		labelDao: {
			findByIds: async () => [],
		} as never,
		projectDao,
		memberDao: {
			findByOrgAndUser: async () => null,
		} as never,
		cycleDao,
		statusService: {
			resolveStatus: async () => {
				throw new Error("not used");
			},
			resolveStatusIds: async () => [],
		} as never,
	});
	return { sqlite, issueDao, projectDao, cycleDao, searchDao, issueService };
};

const ids = (items: { id: string }[]) => items.map((item) => item.id).sort();

test("issue lists hide archived issues unless includeArchived is set", async () => {
	const { issueDao, issueService } = setup();
	const page = await issueDao.list(ORG, PROJECT, {
		page: 1,
		pageSize: 50,
		sort: "updated",
	});
	assert.deepEqual(ids(page.items), ["i1", "i11", "i12", "i3"]);
	assert.equal(page.total, 4);

	const withArchived = await issueDao.list(ORG, PROJECT, {
		page: 1,
		pageSize: 50,
		sort: "updated",
		includeArchived: true,
	});
	assert.deepEqual(ids(withArchived.items), [
		"i1",
		"i10",
		"i11",
		"i12",
		"i2",
		"i3",
	]);
	assert.equal(withArchived.total, 6);

	// The service forwards includeArchived to the DAO.
	const viaService = await issueService.listIssues(ORG, PROJECT, {
		page: 1,
		pageSize: 50,
		sort: "updated",
		includeArchived: true,
	});
	assert.equal(viaService.total, 6);
});

test("org-wide lists hide issues of archived projects", async () => {
	const { issueDao } = setup();
	const orgWide = await issueDao.list(ORG, null, {
		page: 1,
		pageSize: 50,
		sort: "updated",
	});
	assert.equal(ids(orgWide.items).includes("i5"), false);
	assert.equal(orgWide.total, orgWide.items.length);

	// A project-scoped list (and query.projectId) still shows that project.
	const scoped = await issueDao.list(ORG, OLD_PROJECT, {
		page: 1,
		pageSize: 50,
		sort: "updated",
	});
	assert.deepEqual(ids(scoped.items), ["i5"]);
	const byQuery = await issueDao.list(ORG, null, {
		page: 1,
		pageSize: 50,
		sort: "updated",
		projectId: OLD_PROJECT,
	});
	assert.deepEqual(ids(byQuery.items), ["i5"]);
});

test("archived issues stay editable and only hide from lists", async () => {
	const { issueService } = setup();
	const updated = await issueService.updateIssue(ORG, PROJECT, 2, USER, {
		title: "Renamed archived issue",
	});
	assert.equal(updated.title, "Renamed archived issue");
	assert.notEqual(updated.archivedAt, null);
});

test("FTS search and the short-token fallback exclude archived issues", async () => {
	const { searchDao } = setup();
	const longTerm = await searchDao.searchIssues(
		ORG,
		buildSearchTerms("login"),
		20,
	);
	assert.deepEqual(ids(longTerm), ["i1"]);
	// Archived i2 would match "ra" through instr(); the join filters it out.
	const shortTerm = await searchDao.searchIssues(
		ORG,
		buildSearchTerms("ra"),
		20,
	);
	assert.deepEqual(ids(shortTerm), ["i3"]);
	// Comments of archived issues are hidden together with the issue.
	const comments = await searchDao.searchComments(
		ORG,
		buildSearchTerms("login"),
		20,
	);
	assert.deepEqual(ids(comments), ["c1"]);
});

test("project statistics and cycle progress exclude archived issues", async () => {
	const { projectDao, cycleDao } = setup();
	const stats = await projectDao.listIssueCountsByOrg(ORG);
	assert.deepEqual(stats.get(PROJECT), {
		totalIssueCount: 4,
		openIssueCount: 3,
	});
	const progress = await cycleDao.progressByCycle(ORG, ["c1"]);
	assert.deepEqual(progress.get("c1"), { total: 1, terminal: 0 });
});

test("sub-issue lists and progress exclude archived children", async () => {
	const { issueService } = setup();
	const parent = await issueService.getIssue(ORG, PROJECT, 1);
	assert.deepEqual(parent.subIssues.map((issue) => issue.id).sort(), [
		"i12",
		"i3",
	]);
	assert.deepEqual(parent.subIssueProgress, { done: 1, total: 2 });
});

test("archive hides the issue everywhere, writes activity and keeps the detail page", async () => {
	const { sqlite, issueService, issueDao } = setup();
	const archived = await issueService.archiveIssue(ORG, PROJECT, 3, USER);
	assert.equal(typeof archived.archivedAt, "string");
	assert.equal(archived.id, "i3");

	const page = await issueDao.list(ORG, PROJECT, {
		page: 1,
		pageSize: 50,
		sort: "updated",
	});
	assert.deepEqual(ids(page.items), ["i1", "i11", "i12"]);

	// The detail page stays reachable while archived.
	const detail = await issueService.getIssue(ORG, PROJECT, 3);
	assert.equal(detail.archivedAt, archived.archivedAt);

	const activities = sqlite
		.query(
			"SELECT action, field, old_value, new_value FROM activities WHERE issue_id = 'i3'",
		)
		.all() as {
		action: string;
		field: string;
		old_value: string | null;
		new_value: string | null;
	}[];
	assert.deepEqual(activities, [
		{
			action: "issue.updated",
			field: "archived",
			old_value: null,
			new_value: "archived",
		},
	]);

	// Archiving twice is a no-op and does not duplicate the activity row.
	await issueService.archiveIssue(ORG, PROJECT, 3, USER);
	assert.equal(
		(
			sqlite.query("SELECT count(*) AS count FROM activities").get() as {
				count: number;
			}
		).count,
		1,
	);
});

test("restore clears archivedAt and writes the opposite activity", async () => {
	const { sqlite, issueService, issueDao } = setup();
	await issueService.archiveIssue(ORG, PROJECT, 3, USER);
	const restored = await issueService.restoreIssue(ORG, PROJECT, 3, USER);
	assert.equal(restored.archivedAt, null);
	const page = await issueDao.list(ORG, PROJECT, {
		page: 1,
		pageSize: 50,
		sort: "updated",
	});
	assert.deepEqual(ids(page.items), ["i1", "i11", "i12", "i3"]);

	const rows = sqlite
		.query(
			"SELECT old_value, new_value FROM activities WHERE issue_id = 'i3' ORDER BY rowid",
		)
		.all() as { old_value: string | null; new_value: string | null }[];
	assert.deepEqual(rows, [
		{ old_value: null, new_value: "archived" },
		{ old_value: "archived", new_value: null },
	]);
});

test("triage returns backlog + unassigned + live issues, newest first", async () => {
	const { issueService } = setup();
	const all = await issueService.listTriage(ORG);
	assert.deepEqual(
		all.items.map((issue) => issue.id),
		["i11", "i6", "i3", "i1"],
	);
	assert.deepEqual(
		all.items.map((issue) => issue.identifier),
		["WEB-6", "API-2", "WEB-3", "WEB-1"],
	);
	assert.equal(all.items[0]?.statusCategory, "backlog");
	assert.equal(all.items[0]?.projectKey, "WEB");

	const api = await issueService.listTriage(ORG, { projectId: API_PROJECT });
	assert.deepEqual(
		api.items.map((issue) => issue.id),
		["i6"],
	);
});

test("triage rejects an unknown project", async () => {
	const { issueService } = setup();
	await assert.rejects(
		issueService.listTriage(ORG, { projectId: "missing" }),
		(error: unknown) =>
			error instanceof ApiError &&
			error.status === 404 &&
			error.code === "PROJECT_NOT_FOUND",
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
	const calls: string[] = [];
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
			issueService: {
				listIssues: async () => ({
					items: [],
					total: 0,
					page: 1,
					pageSize: 20,
				}),
				listTriage: async () => ({ items: [] }),
				getIssue: async () => ({}),
				createIssue: async () => ({}),
				updateIssue: async () => ({}),
				deleteIssue: async () => undefined,
				archiveIssue: async () => {
					calls.push("archive");
					return {};
				},
				restoreIssue: async () => {
					calls.push("restore");
					return {};
				},
			},
		},
	} as unknown as Dependencies;
	return { app: createRoutes({ auth, dependencies }), calls };
};

test("archive/restore routes are org-scoped and blocked when frozen", async () => {
	const base = "/api/orgs/org/projects/p/issues/1";
	const { app: nonMember } = appFor({ member: false });
	assert.equal(
		(await nonMember.request(`${base}/archive`, { method: "POST" })).status,
		404,
	);

	const { app: frozen } = appFor({ frozen: true });
	const blocked = await frozen.request(`${base}/archive`, { method: "POST" });
	assert.equal(blocked.status, 403);
	const body = (await blocked.json()) as { error: { code: string } };
	assert.equal(body.error.code, "ORG_FROZEN");
	assert.equal(
		(await frozen.request("/api/orgs/org/triage")).status,
		200,
		"reads stay open on frozen orgs",
	);

	const { app, calls } = appFor();
	assert.equal(
		(await app.request(`${base}/archive`, { method: "POST" })).status,
		200,
	);
	assert.equal(
		(await app.request(`${base}/restore`, { method: "POST" })).status,
		200,
	);
	assert.deepEqual(calls, ["archive", "restore"]);
});
