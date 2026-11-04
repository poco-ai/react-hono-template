import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	ApiErrorCode,
	DEFAULT_RUNTIME_CONFIG,
	searchQuerySchema,
} from "@workspace/shared";
import { drizzle } from "drizzle-orm/bun-sqlite";
import {
	type CapabilityContext,
	type CapabilityDeps,
	createCapabilityLayer,
} from "../src/capabilities";
import { createSearchDao } from "../src/dao/search.dao";
import type { Database as AppDatabase } from "../src/db/types";
import type { Dependencies } from "../src/dependencies";
import type { Auth } from "../src/lib/auth";
import { buildSearchTerms } from "../src/lib/search";
import { createRoutes } from "../src/routes";
import { createSearchService } from "../src/services/search.service";

/**
 * Integration tests against in-memory SQLite with the real `search_fts`
 * migration applied (FTS5 trigram virtual tables + sync triggers). They
 * exercise the actual SQL rather than mocking it, including CJK substring
 * matching, soft-delete filtering, cross-org isolation and FTS syntax escaping.
 */
const DDL = `
CREATE TABLE issues (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	project_id text NOT NULL,
	number integer NOT NULL,
	title text NOT NULL,
	description text,
	status_id text NOT NULL,
	priority integer NOT NULL DEFAULT 0,
	assignee_id text,
	deleted_at integer,
	updated_at integer NOT NULL
);
CREATE TABLE projects (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	name text NOT NULL,
	key text NOT NULL,
	description text,
	color text,
	archived integer NOT NULL DEFAULT 0,
	updated_at integer NOT NULL
);
CREATE TABLE issue_statuses (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	name text NOT NULL,
	category text NOT NULL,
	color text NOT NULL
);
CREATE TABLE comments (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	issue_id text NOT NULL,
	author_id text NOT NULL,
	body text NOT NULL,
	created_at integer NOT NULL
);
CREATE TABLE member (
	id text PRIMARY KEY,
	organization_id text NOT NULL,
	user_id text NOT NULL,
	role text NOT NULL
);
CREATE TABLE user (
	id text PRIMARY KEY,
	name text NOT NULL,
	email text NOT NULL,
	image text
);
`;

const NOW = 1_700_000_000_000;

const setup = () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(DDL);
	// The real migration validates the hand-written FTS DDL and its triggers.
	sqlite.exec(
		readFileSync(
			fileURLToPath(
				new URL(
					"../drizzle/20261104143000_search_fts/migration.sql",
					import.meta.url,
				).href,
			),
			"utf8",
		),
	);
	// Drizzle's bun-sqlite driver has no batch(); the search DAO does not use it
	// but the shared test harness keeps the same shape as other DAO tests.
	const db = Object.assign(drizzle({ client: sqlite }), {
		batch: async (statements: unknown[]) => {
			const results: unknown[] = [];
			for (const statement of statements) {
				results.push(await statement);
			}
			return results;
		},
	}) as unknown as AppDatabase;
	return { sqlite, service: createSearchService(createSearchDao(db)) };
};

const addUser = (
	sqlite: Database,
	row: { id: string; name: string; email?: string; image?: string | null },
) =>
	sqlite.run(
		"INSERT INTO user (id, name, email, image) VALUES (?, ?, ?, ?)",
		row.id,
		row.name,
		row.email ?? `${row.id}@example.com`,
		row.image ?? null,
	);

const addMember = (
	sqlite: Database,
	orgId: string,
	userId: string,
	role = "member",
) =>
	sqlite.run(
		"INSERT INTO member (id, organization_id, user_id, role) VALUES (?, ?, ?, ?)",
		`member-${orgId}-${userId}`,
		orgId,
		userId,
		role,
	);

const addProject = (
	sqlite: Database,
	row: {
		id: string;
		orgId?: string;
		name: string;
		key: string;
		description?: string | null;
		archived?: boolean;
	},
) =>
	sqlite.run(
		"INSERT INTO projects (id, org_id, name, key, description, color, archived, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		row.id,
		row.orgId ?? "org",
		row.name,
		row.key,
		row.description ?? null,
		"#6366f1",
		row.archived ? 1 : 0,
		NOW,
	);

const addStatus = (sqlite: Database, orgId = "org") =>
	sqlite.run(
		"INSERT INTO issue_statuses (id, org_id, name, category, color) VALUES ('status-1', ?, 'Todo', 'unstarted', '#3b82f6')",
		orgId,
	);

const addIssue = (
	sqlite: Database,
	row: {
		id: string;
		number: number;
		title: string;
		description?: string | null;
		orgId?: string;
		projectId?: string;
		assigneeId?: string | null;
		deletedAt?: number | null;
		updatedAt?: number;
	},
) =>
	sqlite.run(
		"INSERT INTO issues (id, org_id, project_id, number, title, description, status_id, priority, assignee_id, deleted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'status-1', 2, ?, ?, ?)",
		row.id,
		row.orgId ?? "org",
		row.projectId ?? "project-1",
		row.number,
		row.title,
		row.description ?? null,
		row.assigneeId ?? null,
		row.deletedAt ?? null,
		row.updatedAt ?? NOW,
	);

const addComment = (
	sqlite: Database,
	row: {
		id: string;
		issueId: string;
		authorId: string;
		body: string;
		orgId?: string;
	},
) =>
	sqlite.run(
		"INSERT INTO comments (id, org_id, issue_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		row.id,
		row.orgId ?? "org",
		row.issueId,
		row.authorId,
		row.body,
		NOW,
	);

const seedBase = (sqlite: Database) => {
	addProject(sqlite, { id: "project-1", name: "Website", key: "WEB" });
	addStatus(sqlite);
	addUser(sqlite, { id: "user-1", name: "Alice" });
	addMember(sqlite, "org", "user-1", "owner");
};

test("issue search matches title/description and hides deleted or cross-org rows", async () => {
	const { sqlite, service } = setup();
	seedBase(sqlite);
	addIssue(sqlite, {
		id: "issue-1",
		number: 1,
		title: "Login fails on Safari",
		description: "Users cannot sign in",
		assigneeId: "user-1",
	});
	addIssue(sqlite, { id: "issue-2", number: 2, title: "Payment timeout" });
	addIssue(sqlite, {
		id: "issue-3",
		number: 3,
		title: "Login crash",
		deletedAt: NOW,
	});
	addIssue(sqlite, {
		id: "issue-4",
		number: 4,
		title: "Login elsewhere",
		orgId: "org-2",
	});

	const result = await service.searchAll("org", { q: "login", limit: 8 });
	assert.deepEqual(
		result.issues.map((issue) => issue.id),
		["issue-1"],
	);
	const hit = result.issues[0];
	assert.equal(hit.identifier, "WEB-1");
	assert.equal(hit.statusName, "Todo");
	assert.equal(hit.statusCategory, "unstarted");
	assert.deepEqual(hit.assignee, { id: "user-1", name: "Alice", image: null });
	assert.equal(hit.descriptionExcerpt, "Users cannot sign in");
	assert.deepEqual(result.comments, []);
	assert.deepEqual(result.projects, []);
});

test("Chinese substring search works for short (instr) and long (trigram) queries", async () => {
	const { sqlite, service } = setup();
	seedBase(sqlite);
	addIssue(sqlite, {
		id: "issue-cn",
		number: 1,
		title: "用户登录失败时页面卡住",
		description: "点击登录后无响应",
	});
	addIssue(sqlite, { id: "issue-en", number: 2, title: "Login fails" });

	const short = await service.searchAll("org", { q: "登录", limit: 8 });
	assert.deepEqual(
		short.issues.map((issue) => issue.id),
		["issue-cn"],
		"two-character CJK term falls back to instr()",
	);

	const long = await service.searchAll("org", { q: "登录失败", limit: 8 });
	assert.deepEqual(
		long.issues.map((issue) => issue.id),
		["issue-cn"],
		"trigram index matches a four-character CJK substring",
	);

	const description = await service.searchAll("org", { q: "无响应", limit: 8 });
	assert.deepEqual(
		description.issues.map((issue) => issue.id),
		["issue-cn"],
	);
	// Mixed-length query: long term via FTS, short term via instr().
	const mixed = await service.searchAll("org", { q: "登录 fail", limit: 8 });
	assert.deepEqual(mixed.issues, []);
});

test("comment hits carry their issue reference and respect delete/org scope", async () => {
	const { sqlite, service } = setup();
	seedBase(sqlite);
	addIssue(sqlite, { id: "issue-1", number: 1, title: "Login fails" });
	addIssue(sqlite, {
		id: "issue-deleted",
		number: 2,
		title: "Old login",
		deletedAt: NOW,
	});
	addIssue(sqlite, {
		id: "issue-other",
		number: 3,
		title: "Other org login",
		orgId: "org-2",
	});
	addComment(sqlite, {
		id: "comment-1",
		issueId: "issue-1",
		authorId: "user-1",
		body: "Please fix the login flow, see the attached note.",
	});
	addComment(sqlite, {
		id: "comment-deleted",
		issueId: "issue-deleted",
		authorId: "user-1",
		body: "login workaround",
	});
	addComment(sqlite, {
		id: "comment-other",
		issueId: "issue-other",
		authorId: "user-1",
		orgId: "org-2",
		body: "login note elsewhere",
	});

	const result = await service.searchAll("org", { q: "login", limit: 8 });
	assert.deepEqual(
		result.comments.map((comment) => comment.id),
		["comment-1"],
	);
	const comment = result.comments[0];
	assert.equal(comment.issue.identifier, "WEB-1");
	assert.equal(comment.issue.title, "Login fails");
	assert.equal(comment.author.name, "Alice");
	assert.match(comment.body, /login flow/);

	// Triggers keep the index in sync on update and delete.
	sqlite.run(
		"UPDATE comments SET body = '支付失败的替代方案' WHERE id = 'comment-1'",
	);
	const updated = await service.searchAll("org", { q: "支付失败", limit: 8 });
	assert.deepEqual(
		updated.comments.map((hit) => hit.id),
		["comment-1"],
	);
	assert.deepEqual(
		(await service.searchAll("org", { q: "login flow", limit: 8 })).comments,
		[],
	);
	sqlite.run("DELETE FROM comments WHERE id = 'comment-1'");
	assert.deepEqual(
		(await service.searchAll("org", { q: "支付失败", limit: 8 })).comments,
		[],
	);
});

test("issue FTS triggers follow title/description updates, soft delete, restore and hard delete", async () => {
	const { sqlite, service } = setup();
	seedBase(sqlite);
	addIssue(sqlite, {
		id: "issue-1",
		number: 1,
		title: "Login fails",
		description: "Users cannot sign in",
	});
	addIssue(sqlite, { id: "issue-2", number: 2, title: "Dashboard charts" });

	const issueIds = async (q: string) =>
		(await service.searchAll("org", { q, limit: 8 })).issues.map(
			(hit) => hit.id,
		);

	// AFTER UPDATE OF title, description.
	sqlite.run(
		"UPDATE issues SET title = 'Checkout crashes' WHERE id = 'issue-1'",
	);
	assert.deepEqual(await issueIds("login"), []);
	assert.deepEqual(await issueIds("checkout"), ["issue-1"]);

	sqlite.run(
		"UPDATE issues SET description = 'Refund flow broken' WHERE id = 'issue-1'",
	);
	assert.deepEqual(await issueIds("refund"), ["issue-1"]);
	assert.deepEqual(await issueIds("sign"), []);

	// Soft delete keeps the FTS row; the join filters it, a restore revives it.
	sqlite.run("UPDATE issues SET deleted_at = ? WHERE id = 'issue-1'", NOW);
	assert.deepEqual(await issueIds("checkout"), []);
	sqlite.run("UPDATE issues SET deleted_at = NULL WHERE id = 'issue-1'");
	assert.deepEqual(await issueIds("checkout"), ["issue-1"]);

	// AFTER DELETE removes the index row entirely.
	sqlite.run("DELETE FROM issues WHERE id = 'issue-1'");
	assert.deepEqual(await issueIds("checkout"), []);
	assert.deepEqual(await issueIds("refund"), []);
	assert.deepEqual(await issueIds("dashboard"), ["issue-2"]);
});

test("archived projects hide their issues and comments from search", async () => {
	const { sqlite, service } = setup();
	seedBase(sqlite);
	addProject(sqlite, {
		id: "project-old",
		name: "Legacy site",
		key: "OLD",
		archived: true,
	});
	addIssue(sqlite, {
		id: "issue-active",
		number: 1,
		title: "Login on Safari",
	});
	addIssue(sqlite, {
		id: "issue-archived",
		number: 2,
		title: "Login on Firefox",
		projectId: "project-old",
	});
	addComment(sqlite, {
		id: "comment-archived",
		issueId: "issue-archived",
		authorId: "user-1",
		body: "login note in an archived project",
	});

	const result = await service.searchAll("org", { q: "login", limit: 8 });
	assert.deepEqual(
		result.issues.map((hit) => hit.id),
		["issue-active"],
	);
	assert.deepEqual(result.comments, []);

	// The instr() fallback for short terms applies the same filter.
	const short = await service.searchAll("org", { q: "lo", limit: 8 });
	assert.deepEqual(
		short.issues.map((hit) => hit.id),
		["issue-active"],
	);
	assert.deepEqual(short.comments, []);

	// Unarchiving the project makes its issues and comments searchable again.
	sqlite.run("UPDATE projects SET archived = 0 WHERE id = 'project-old'");
	const restored = await service.searchAll("org", { q: "login", limit: 8 });
	assert.deepEqual(restored.issues.map((hit) => hit.id).sort(), [
		"issue-active",
		"issue-archived",
	]);
	assert.deepEqual(
		restored.comments.map((hit) => hit.id),
		["comment-archived"],
	);
});

test("special characters never break the FTS query", async () => {
	const { sqlite, service } = setup();
	seedBase(sqlite);
	addIssue(sqlite, {
		id: "issue-special",
		number: 1,
		title: 'Fix "quoted" *star* path 100% (beta)',
	});
	addIssue(sqlite, { id: "issue-plain", number: 2, title: "Plain issue" });
	addIssue(sqlite, { id: "issue-login", number: 3, title: "Login issue" });

	const queries = [
		'"quoted"',
		"*",
		'"',
		"100%",
		"(beta)",
		"-",
		"a*b",
		"star path",
		"OR AND NOT",
		"x".repeat(100),
		// NUL/DEL would make SQLite report "unterminated string" inside the
		// quoted FTS5 phrase; buildSearchTerms strips them before tokenizing.
		"\u0000",
		"\u0001\u0002",
		"log\u0000in",
		"login\u007f",
	];
	for (const q of queries) {
		const result = await service.searchAll("org", { q, limit: 8 });
		assert.ok(Array.isArray(result.issues), `issues array for ${q}`);
		assert.ok(Array.isArray(result.comments));
	}

	assert.deepEqual(
		await service.searchAll("org", { q: "\u0000", limit: 8 }),
		{ issues: [], comments: [], projects: [], members: [] },
		"a query of only control characters is sanitized to an empty search",
	);
	assert.deepEqual(
		(await service.searchAll("org", { q: "log\u0000in", limit: 8 })).issues.map(
			(hit) => hit.id,
		),
		["issue-login"],
		"control characters are replaced with spaces, not dropped into the term",
	);

	assert.deepEqual(
		(await service.searchAll("org", { q: '"quoted"', limit: 8 })).issues.map(
			(hit) => hit.id,
		),
		["issue-special"],
		"quoted phrase matches literally",
	);
	assert.deepEqual(
		(await service.searchAll("org", { q: "100%", limit: 8 })).issues.map(
			(hit) => hit.id,
		),
		["issue-special"],
	);
	assert.deepEqual(
		(await service.searchAll("org", { q: "x".repeat(100), limit: 8 })).issues,
		[],
	);
});

test("empty queries return empty sections and limit caps each section", async () => {
	const { sqlite, service } = setup();
	seedBase(sqlite);
	for (let index = 1; index <= 25; index++) {
		addIssue(sqlite, {
			id: `bulk-${index}`,
			number: index,
			title: `Alpha item ${index}`,
			updatedAt: NOW - index,
		});
	}

	for (const q of ["", "   "]) {
		assert.deepEqual(await service.searchAll("org", { q, limit: 8 }), {
			issues: [],
			comments: [],
			projects: [],
			members: [],
		});
	}

	const capped = await service.searchAll("org", { q: "alpha", limit: 20 });
	assert.equal(capped.issues.length, 20);
	const defaultLimit = await service.searchAll("org", { q: "alpha", limit: 8 });
	assert.equal(defaultLimit.issues.length, 8);

	// Short (instr) fallback is also capped exactly at the requested limit.
	const short = await service.searchAll("org", { q: "it", limit: 5 });
	assert.equal(short.issues.length, 5);
});

test("projects and members match by name/description/email without leaking email", async () => {
	const { sqlite, service } = setup();
	addProject(sqlite, {
		id: "project-1",
		name: "Website Redesign",
		key: "WEB",
		description: "Marketing site rebuild",
	});
	addProject(sqlite, {
		id: "project-archived",
		name: "Website Legacy",
		key: "OLD",
		archived: true,
	});
	addProject(sqlite, {
		id: "project-other",
		name: "Website Elsewhere",
		key: "OTH",
		orgId: "org-2",
	});
	addUser(sqlite, {
		id: "bob",
		name: "Bob Chen",
		email: "bob@example.com",
		image: "https://cdn.example/bob.png",
	});
	addMember(sqlite, "org", "bob");
	addUser(sqlite, { id: "carol", name: "Carol Wu" });
	addUser(sqlite, { id: "dave", name: "Dave Website" });
	addMember(sqlite, "org-2", "dave");

	const projects = await service.searchAll("org", { q: "website", limit: 8 });
	assert.deepEqual(
		projects.projects.map((project) => project.id),
		["project-1"],
		"archived and other-org projects are excluded",
	);

	const description = await service.searchAll("org", {
		q: "marketing",
		limit: 8,
	});
	assert.equal(description.projects[0]?.id, "project-1");
	assert.equal(
		description.projects[0]?.descriptionExcerpt,
		"Marketing site rebuild",
	);

	const byName = await service.searchAll("org", { q: "bob", limit: 8 });
	assert.deepEqual(byName.members, [
		{ id: "bob", name: "Bob Chen", image: "https://cdn.example/bob.png" },
	]);
	assert.equal("email" in (byName.members[0] ?? {}), false);

	const byEmail = await service.searchAll("org", {
		q: "example.com",
		limit: 8,
	});
	assert.deepEqual(
		byEmail.members.map((member) => member.id),
		["bob"],
		"email is searchable but not returned",
	);
	assert.deepEqual(
		(await service.searchAll("org", { q: "carol", limit: 8 })).members,
		[],
		"non-members are never returned",
	);
});

test("search route requires membership, allows frozen reads and validates input", async () => {
	const calls: { orgId: string; input: { q: string; limit: number } }[] = [];
	const appFor = ({
		loggedIn = true,
		member = true,
		frozen = false,
	}: {
		loggedIn?: boolean;
		member?: boolean;
		frozen?: boolean;
	} = {}) => {
		const auth = {
			api: {
				getSession: async () =>
					loggedIn ? { user: { id: "user", role: "user" } } : null,
			},
		} as unknown as Auth;
		const dependencies = {
			daos: {
				memberDao: {
					findByOrgAndUser: async () =>
						member ? { role: "member", frozen } : null,
				},
			},
			services: {
				bootstrapService: {},
				projectService: {},
				issueService: {},
				billingService: {},
				adminOrgService: {},
				configService: {
					getConfig: async () => DEFAULT_RUNTIME_CONFIG,
				},
				mediaService: {},
				searchService: {
					searchAll: async (
						orgId: string,
						input: { q: string; limit: number },
					) => {
						calls.push({ orgId, input });
						return { issues: [], comments: [], projects: [], members: [] };
					},
				},
			},
		} as unknown as Dependencies;
		return createRoutes({ auth, dependencies });
	};

	const expectError = async (
		response: Response,
		status: number,
		code: string,
	) => {
		assert.equal(response.status, status);
		const body = (await response.json()) as { error: { code: string } };
		assert.equal(body.error.code, code);
	};

	await expectError(
		await appFor({ loggedIn: false }).request("/api/orgs/org/search?q=login"),
		401,
		"UNAUTHORIZED",
	);
	await expectError(
		await appFor({ member: false }).request("/api/orgs/org/search?q=login"),
		404,
		"NOT_FOUND",
	);

	const frozen = appFor({ frozen: true }).request(
		"/api/orgs/org/search?q=login",
	);
	const frozenResponse = await frozen;
	assert.equal(frozenResponse.status, 200);
	assert.deepEqual(await frozenResponse.json(), {
		ok: true,
		data: { issues: [], comments: [], projects: [], members: [] },
	});

	await appFor().request("/api/orgs/org/search?q=alpha&limit=3");
	assert.deepEqual(calls.at(-1), {
		orgId: "org",
		input: { q: "alpha", limit: 3 },
	});

	await appFor().request("/api/orgs/org/search");
	assert.deepEqual(calls.at(-1), {
		orgId: "org",
		input: { q: "", limit: 8 },
	});

	// NUL in the query string is accepted (the service strips it); it must
	// never reach SQLite as a quoted FTS5 phrase and 500.
	const nul = await appFor().request("/api/orgs/org/search?q=%00");
	assert.equal(nul.status, 200);

	for (const query of [
		`q=${"a".repeat(101)}`,
		"q=a&limit=0",
		"q=a&limit=21",
		"q=a&limit=abc",
	]) {
		await expectError(
			await appFor().request(`/api/orgs/org/search?${query}`),
			400,
			"VALIDATION",
		);
	}
});

test("searchQuerySchema defaults and coerces command-palette parameters", () => {
	assert.deepEqual(searchQuerySchema.parse({}), { q: "", limit: 8 });
	assert.deepEqual(searchQuerySchema.parse({ q: "  alpha  ", limit: "5" }), {
		q: "alpha",
		limit: 5,
	});
	assert.equal(searchQuerySchema.safeParse({ limit: 21 }).success, false);
	assert.equal(
		searchQuerySchema.safeParse({ q: "a".repeat(101) }).success,
		false,
	);
});

test("search_all capability calls the shared search service", async () => {
	const calls: { orgId: string; input: unknown }[] = [];
	const issueHit = {
		id: "issue-1",
		projectId: "project-1",
		projectKey: "WEB",
		number: 1,
		identifier: "WEB-1",
		title: "Login fails",
		descriptionExcerpt: null,
		statusId: "status-1",
		statusName: "Todo",
		statusColor: "#3b82f6",
		statusCategory: "unstarted",
		priority: 2,
		assignee: null,
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
	const deps = {
		services: {
			searchService: {
				searchAll: async (orgId: string, input: unknown) => {
					calls.push({ orgId, input });
					return {
						issues: [issueHit],
						comments: [],
						projects: [],
						members: [],
					};
				},
			},
		},
		daos: {
			memberDao: {
				findByOrgAndUser: async () => ({ role: "owner", frozen: false }),
			},
		},
	} as unknown as CapabilityDeps;
	const layer = createCapabilityLayer(deps);
	const entry = layer.get("search_all");
	assert.equal(entry?.effect, "read");
	assert.deepEqual(entry?.scopes, ["read"]);

	const result = await layer.execute(
		"search_all",
		{
			orgId: "org",
			actor: {
				userId: "user-1",
				surface: "chat",
				scopes: ["read"],
				role: "owner",
			},
			canWrite: false,
			locale: "en",
			webBaseUrl: "https://app.example.com",
			background: (task) => {
				void task().catch(() => undefined);
			},
		} satisfies CapabilityContext,
		{ q: "login" },
	);

	assert.deepEqual(calls, [{ orgId: "org", input: { q: "login", limit: 8 } }]);
	assert.match(result.summary, /Found 1 issue\(s\).*matching "login"/);
	assert.deepEqual(result.data, {
		issues: [issueHit],
		comments: [],
		projects: [],
		members: [],
	});
	assert.ok(
		result.links.some((link) => link.url.endsWith("/projects/project-1/1")),
	);

	await assert.rejects(
		layer.execute(
			"search_all",
			{
				orgId: "org",
				actor: { userId: "user-1", surface: "chat", scopes: ["read"] },
				canWrite: false,
				locale: "en",
				webBaseUrl: "https://app.example.com",
				background: () => undefined,
			},
			{ q: "" },
		),
		(err) =>
			err instanceof Error &&
			"code" in err &&
			err.code === ApiErrorCode.VALIDATION,
	);
});

test("buildSearchTerms quotes terms and separates short fallbacks", () => {
	const terms = buildSearchTerms('  login   "quoted" a*b 中 ');
	assert.equal(terms.raw, 'login "quoted" a*b 中');
	assert.deepEqual(terms.ftsTokens, ["login", '"quoted"', "a*b"]);
	assert.deepEqual(terms.shortTokens, ["中"]);
	assert.equal(
		terms.ftsQuery,
		'"login" """quoted""" "a*b"',
		"quotes are doubled so user input stays literal",
	);
	assert.deepEqual(buildSearchTerms("   "), {
		raw: "",
		tokens: [],
		ftsTokens: [],
		shortTokens: [],
		ftsQuery: null,
	});
	// NUL/DEL are replaced with spaces before tokenizing and quote escaping.
	assert.equal(buildSearchTerms("log\u0000in").raw, "log in");
	assert.deepEqual(buildSearchTerms("log\u0000in").ftsTokens, ["log"]);
	assert.deepEqual(buildSearchTerms("log\u0000in").shortTokens, ["in"]);
	assert.equal(buildSearchTerms("a\u007fb").raw, "a b");
	assert.deepEqual(buildSearchTerms("\u0000\u0001\u007f"), {
		raw: "",
		tokens: [],
		ftsTokens: [],
		shortTokens: [],
		ftsQuery: null,
	});
});
