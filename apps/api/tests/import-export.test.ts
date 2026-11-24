import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	escapeCsvCell,
	ISSUE_CSV_EXPORT_HEADERS,
	parseCsvText,
	serializeCsvText,
	unescapeCsvCell,
} from "@workspace/shared";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createMemberDao } from "../src/core/dao/member.dao";
import type { SessionEnv } from "../src/core/middleware/auth";
import type { OrgEnv } from "../src/core/middleware/org";
import { requireOrgMember } from "../src/core/middleware/org";
import { createCycleDao } from "../src/features/cycles/dao/cycle.dao";
import { assertCycleAssignable } from "../src/features/cycles/services/cycle.service";
import {
	chunkRowsByBudget,
	createIssueDao,
	ISSUE_STATEMENT_MAX_BYTES,
} from "../src/features/issues/dao/issue.dao";
import { createIssuesRoutes } from "../src/features/issues/routes/issues";
import { createIssueService } from "../src/features/issues/services/issue.service";
import { createLabelDao } from "../src/features/labels/dao/label.dao";
import { createProjectDao } from "../src/features/projects/dao/project.dao";
import { createStatusDao } from "../src/features/statuses/dao/status.dao";
import { createStatusService } from "../src/features/statuses/services/status.service";
import {
	seedCycle,
	seedMember,
	seedOrganization,
	seedProject,
	seedStatus,
	seedUser,
} from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

/**
 * Issue CSV import/export: RFC 4180 escaping, org/project isolation, archived
 * exclusion, per-row validation with partial success, contiguous numbering,
 * the 100-row import cap, frozen-org blocking and cross-org scoping.
 */

const ORG = "org";
const OTHER_ORG = "org-2";
const PROJECT = "p1";
const OTHER_PROJECT = "p2";
const USER = "user-1";
const OTHER_USER = "user-2";

const setup = () => {
	const { sqlite, db } = createTestDb();
	for (const [id, name, email] of [
		[USER, "Alice", "alice@example.com"],
		[OTHER_USER, "Bob", "bob@example.com"],
	] as const) {
		seedUser(sqlite, { id, name, email });
	}
	for (const [orgId, slug] of [
		[ORG, "org"],
		[OTHER_ORG, "org-2"],
	] as const) {
		seedOrganization(sqlite, { id: orgId, name: orgId, slug });
	}
	for (const [orgId, userId, role] of [
		[ORG, USER, "owner"],
		[ORG, OTHER_USER, "owner"],
		[OTHER_ORG, USER, "owner"],
	] as const) {
		seedMember(sqlite, { orgId, userId, role });
	}
	for (const [id, orgId, key, nextNumber] of [
		[PROJECT, ORG, "WEB", 10],
		[OTHER_PROJECT, ORG, "API", 1],
		["p-other", OTHER_ORG, "OTH", 1],
	] as const) {
		seedProject(sqlite, {
			id,
			orgId,
			name: `Project ${key}`,
			key,
			nextNumber,
		});
	}
	for (const [id, name, category, position, isDefault] of [
		["s-backlog", "Backlog", "backlog", 0, true],
		["s-progress", "In Progress", "started", 1, false],
		["s-done", "Done", "completed", 2, false],
	] as const) {
		seedStatus(sqlite, {
			id,
			orgId: ORG,
			name,
			category,
			position,
			isDefault,
		});
	}
	seedStatus(sqlite, {
		id: "s-other",
		orgId: OTHER_ORG,
		name: "Other",
		category: "backlog",
	});
	for (const [id, name] of [
		["l-bug", "Bug"],
		["l-frontend", "Frontend"],
	] as const) {
		sqlite.run(
			"INSERT INTO labels (id, org_id, name) VALUES (?, ?, ?)",
			id,
			ORG,
			name,
		);
	}
	seedCycle(sqlite, {
		id: "c1",
		orgId: ORG,
		projectId: PROJECT,
		name: "Sprint 1",
		number: 1,
		startsAt: 0,
		endsAt: 100,
	});

	const addIssue = (
		id: string,
		number: number,
		title: string,
		options: {
			projectId?: string;
			orgId?: string;
			description?: string;
			statusId?: string;
			assigneeId?: string;
			dueDate?: number;
			estimate?: number;
			deletedAt?: number;
			archivedAt?: number;
		} = {},
	) =>
		sqlite.run(
			"INSERT INTO issues (id, org_id, project_id, number, title, description, status_id, assignee_id, due_date, estimate, deleted_at, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1000, 2000)",
			id,
			options.orgId ?? ORG,
			options.projectId ?? PROJECT,
			number,
			title,
			options.description ?? null,
			options.statusId ?? "s-backlog",
			options.assigneeId ?? null,
			options.dueDate ?? null,
			options.estimate ?? null,
			options.deletedAt ?? null,
			options.archivedAt ?? null,
		);
	addIssue("i1", 1, 'Fix "quoted", comma', {
		description: "line one\nline two",
		assigneeId: USER,
		dueDate: Date.UTC(2026, 4, 1),
		estimate: 3,
	});
	addIssue("i-archived", 2, "Archived issue", { archivedAt: 1 });
	addIssue("i-deleted", 3, "Deleted issue", { deletedAt: 1 });
	addIssue("i-other-project", 1, "Other project", { projectId: OTHER_PROJECT });
	addIssue("i-other-org", 1, "Other org", {
		orgId: OTHER_ORG,
		projectId: "p-other",
	});
	sqlite.run(
		"INSERT INTO issue_labels (issue_id, label_id) VALUES ('i1', 'l-bug')",
	);

	const issueDao = createIssueDao(db);
	const labelDao = createLabelDao(db);
	const projectDao = createProjectDao(db);
	const memberDao = createMemberDao(db);
	const cycleDao = createCycleDao(db);
	const statusService = createStatusService(createStatusDao(db));
	const service = createIssueService({
		issueDao,
		labelDao,
		projectDao,
		memberDao,
		cycleGuard: {
			assertCycleAssignable: (orgId, projectId, cycleId) =>
				assertCycleAssignable(cycleDao, orgId, projectId, cycleId),
			findById: (orgId, cycleId) => cycleDao.findById(orgId, cycleId),
			listAllByProject: (orgId, projectId) =>
				cycleDao.listAllByProject(orgId, projectId),
		},
		statusService,
	});
	return { sqlite, service, memberDao, issueDao, labelDao };
};

const buildApp = (deps: ReturnType<typeof setup>) => {
	const app = new Hono<SessionEnv & OrgEnv>();
	app.onError((err, c) => {
		if (err instanceof ApiError) {
			return c.json(
				{ ok: false, error: { code: err.code, message: err.message } },
				err.status as ContentfulStatusCode,
			);
		}
		return c.json(
			{ ok: false, error: { code: "INTERNAL_ERROR", message: String(err) } },
			500,
		);
	});
	app.use(
		"/api/orgs/:orgId/*",
		async (c, next) => {
			c.set("session", { user: { id: USER } } as never);
			await next();
		},
		requireOrgMember(deps.memberDao),
	);
	app.route("/", createIssuesRoutes(deps.service));
	return app;
};

const isApiError = (status: number, code: ApiErrorCode) => (error: unknown) =>
	error instanceof ApiError && error.status === status && error.code === code;

test("RFC 4180 parser handles quotes, commas, newlines, CRLF and BOM", () => {
	const text =
		'\ufefftitle,description\r\n"a, b","line1\r\nline2"\r\n"say ""hi""",plain\n\n';
	assert.deepEqual(parseCsvText(text), [
		["title", "description"],
		["a, b", "line1\r\nline2"],
		['say "hi"', "plain"],
	]);
	// Unterminated quotes keep the remainder instead of throwing.
	assert.deepEqual(parseCsvText('a,"b'), [["a", "b"]]);
});

test("CSV serializer quotes only when needed and round-trips", () => {
	const rows = [
		["plain", "a,b", 'say "hi"', "line\nbreak"],
		[" padded ", "", "x"],
	];
	const csv = serializeCsvText(rows);
	assert.equal(csv, 'plain,"a,b","say ""hi""","line\nbreak"\r\n" padded ",,x');
	assert.deepEqual(parseCsvText(csv), rows);
});

test("CSV serializer neutralizes formula-like cells and round-trips", () => {
	const rows = [
		[
			"=1+1",
			"+cmd",
			"-2",
			"@x",
			"\tTab",
			"\rCR",
			"plain",
			"'tis the season",
			'a,"b"',
			"line\nbreak",
			"'=not-a-formula",
		],
	];
	const parsed = parseCsvText(serializeCsvText(rows));
	// Spreadsheet apps would evaluate the first four; a leading quote stops it.
	for (const index of [0, 1, 2, 3, 4, 5]) {
		assert.ok(
			parsed[0][index].startsWith("'"),
			`column ${index} was not escaped`,
		);
	}
	// Normal text (including a genuine leading apostrophe) is untouched.
	for (const index of [6, 7, 8, 9]) {
		assert.equal(parsed[0][index], rows[0][index]);
	}
	// A literal apostrophe before a formula-like body is doubled, so its
	// round-trip stays unambiguous.
	assert.equal(escapeCsvCell("'=not-a-formula"), "''=not-a-formula");
	// Import removes the safety prefix again, so export → import round-trips.
	assert.deepEqual(
		parsed.map((row) => row.map(unescapeCsvCell)),
		rows,
	);
	assert.equal(escapeCsvCell("plain"), "plain");
	assert.equal(unescapeCsvCell("'tis the season"), "'tis the season");
});

test("bulk inserts split by UTF-8 byte budget as well as row count", () => {
	// 6000 CJK chars ≈ 18 KB per row: three fit in the 60 KB statement budget.
	const large = Array.from({ length: 8 }, (_, index) => ({
		id: `row-${index}`,
		description: "中".repeat(6000),
	}));
	const chunks = chunkRowsByBudget(large, 6);
	assert.equal(chunks.length, 3);
	const encoder = new TextEncoder();
	for (const chunk of chunks) {
		assert.ok(chunk.length <= 6);
		assert.ok(
			encoder.encode(JSON.stringify(chunk)).length <= ISSUE_STATEMENT_MAX_BYTES,
		);
	}
	// Small rows still hit the row cap (D1 parameter limit).
	const small = Array.from({ length: 12 }, (_, index) => ({ id: index }));
	assert.deepEqual(
		chunkRowsByBudget(small, 6).map((chunk) => chunk.length),
		[6, 6],
	);
});

test("import strips the spreadsheet prefix so exported content round-trips", async () => {
	const { service, sqlite } = setup();
	sqlite.run(
		"INSERT INTO issues (id, org_id, project_id, number, title, description, status_id, created_at, updated_at) VALUES ('i-formula', ?, ?, 4, '=1+1', '@SUM(A1)', 's-backlog', 1000, 2000)",
		ORG,
		PROJECT,
	);
	const exported = await service.exportIssues(ORG, PROJECT);
	const [header, , formulaRow] = parseCsvText(exported.csv);
	assert.equal(formulaRow[2], "'=1+1");
	assert.equal(formulaRow[3], "'@SUM(A1)");

	const imported = Object.fromEntries(
		header.map((column, index) => [column, formulaRow[index]]),
	);
	const result = await service.importIssues(ORG, PROJECT, USER, {
		rows: [imported],
	});
	assert.equal(result.created, 1);
	// The new issue (number 10) stores the original text, not the prefix.
	const stored = sqlite
		.query(
			"SELECT title, description FROM issues WHERE project_id = ? AND number = 10",
		)
		.get(PROJECT) as { title: string; description: string };
	assert.equal(stored.title, "=1+1");
	assert.equal(stored.description, "@SUM(A1)");
});

test("import chunks large descriptions instead of exceeding D1 statement size", async () => {
	const { service, sqlite } = setup();
	const result = await service.importIssues(ORG, PROJECT, USER, {
		rows: Array.from({ length: 4 }, (_, index) => ({
			title: `Big ${index + 1}`,
			description: "长".repeat(15000),
		})),
	});
	assert.equal(result.created, 4);
	assert.deepEqual(result.errors, []);
	const stored = sqlite
		.query(
			"SELECT length(description) AS size FROM issues WHERE title LIKE 'Big %' ORDER BY number",
		)
		.all() as { size: number }[];
	assert.deepEqual(
		stored.map((row) => row.size),
		[15000, 15000, 15000, 15000],
	);
});

test("archived issues do not block label deletion", async () => {
	const { labelDao, sqlite } = setup();
	sqlite.run(
		"INSERT INTO labels (id, org_id, name) VALUES ('l-old', ?, 'Old')",
		ORG,
	);
	// Archived issue references l-old, the active issue references l-bug.
	sqlite.run(
		"INSERT INTO issue_labels (issue_id, label_id) VALUES ('i-archived', 'l-old')",
	);
	assert.equal(await labelDao.countIssueReferences(ORG, "l-old"), 0);
	assert.equal(await labelDao.countIssueReferences(ORG, "l-bug"), 1);
});

test("export serializes escaping, excludes archived/deleted and stays project-scoped", async () => {
	const { service } = setup();
	const result = await service.exportIssues(ORG, PROJECT);
	assert.equal(result.filename, "WEB-issues.csv");
	assert.equal(result.exported, 1);
	assert.equal(result.total, 1);
	assert.equal(result.truncated, false);

	const rows = parseCsvText(result.csv);
	assert.deepEqual(rows[0], [...ISSUE_CSV_EXPORT_HEADERS]);
	assert.equal(rows.length, 2);
	const row = rows[1];
	assert.equal(row[0], "WEB-1");
	assert.equal(row[1], "Project WEB");
	assert.equal(row[2], 'Fix "quoted", comma');
	assert.equal(row[3], "line one\nline two");
	assert.equal(row[4], "Backlog");
	assert.equal(row[5], "none");
	assert.equal(row[6], "Alice");
	// Privacy: assignees are exported by display name, never by email.
	assert.ok(!result.csv.includes("alice@example.com"));
	assert.ok(!result.csv.includes("bob@example.com"));
	assert.equal(row[7], "Bug");
	assert.equal(row[8], "2026-05-01");
	assert.equal(row[9], "3");
	assert.equal(row[10], "");
	assert.match(row[11], /^1970-01-01T00:00:01\.000Z$/);

	await assert.rejects(
		service.exportIssues(ORG, "p-other"),
		isApiError(404, ApiErrorCode.PROJECT_NOT_FOUND),
	);
});

test("import resolves names, keeps contiguous numbers and partially succeeds", async () => {
	const { service, sqlite } = setup();
	const result = await service.importIssues(ORG, PROJECT, USER, {
		rows: [
			{
				title: "  First imported  ",
				description: "desc",
				status: "done",
				priority: "urgent",
				assignee: "alice@example.com",
				labels: "Bug, Frontend",
				due_date: "2026-05-01",
				estimate: "5",
				cycle: "Sprint 1",
			},
			{
				title: "Second imported",
				status: "In Progress",
				priority: "3",
				assignee: "Bob",
			},
			{ title: "", status: "Done" },
			{ title: "Bad status", status: "Ghost" },
			{ title: "Bad label", labels: "Nope" },
			{ title: "Bad assignee", assignee: "Nobody" },
			{ title: "Bad estimate", estimate: "101" },
			{ title: "Bad date", due_date: "not-a-date" },
		],
	});
	assert.equal(result.created, 2);
	assert.deepEqual(
		result.errors.map((error) => error.row),
		[3, 4, 5, 6, 7, 8],
	);
	assert.match(result.errors[0].message, /Title/);
	assert.match(result.errors[1].message, /Unknown status/);
	assert.match(result.errors[2].message, /Unknown label/);
	assert.match(result.errors[3].message, /Unknown assignee/);
	assert.match(result.errors[4].message, /estimate/);
	assert.match(result.errors[5].message, /due_date/);

	const rows = sqlite
		.query(
			"SELECT number, title, status_id, priority, assignee_id, due_date, estimate, cycle_id FROM issues WHERE project_id = ? AND number >= 10 ORDER BY number",
		)
		.all(PROJECT) as {
		number: number;
		title: string;
		status_id: string;
		priority: number;
		assignee_id: string | null;
		due_date: number | null;
		estimate: number | null;
		cycle_id: string | null;
	}[];
	assert.deepEqual(
		rows.map((row) => row.number),
		[10, 11],
	);
	assert.equal(rows[0].title, "First imported");
	assert.equal(rows[0].status_id, "s-done");
	assert.equal(rows[0].priority, 1);
	assert.equal(rows[0].assignee_id, USER);
	assert.equal(rows[0].estimate, 5);
	assert.equal(rows[0].cycle_id, "c1");
	assert.equal(rows[0].due_date, Date.UTC(2026, 4, 1));
	assert.equal(rows[1].assignee_id, OTHER_USER);
	assert.equal(rows[1].priority, 3);

	const labels = sqlite
		.query(
			"SELECT label_id FROM issue_labels WHERE issue_id = (SELECT id FROM issues WHERE project_id = ? AND number = 10) ORDER BY label_id",
		)
		.all(PROJECT) as { label_id: string }[];
	assert.deepEqual(
		labels.map((label) => label.label_id),
		["l-bug", "l-frontend"],
	);
	const project = sqlite
		.query("SELECT next_number FROM projects WHERE id = ?")
		.get(PROJECT) as { next_number: number };
	assert.equal(project.next_number, 12);
	// One created activity per imported issue.
	const activities = sqlite
		.query("SELECT count(*) AS count FROM activities WHERE project_id = ?")
		.get(PROJECT) as { count: number };
	assert.equal(activities.count, 2);
});

test("import enforces the 100-row cap", async () => {
	const { service } = setup();
	await assert.rejects(
		service.importIssues(ORG, PROJECT, USER, {
			rows: Array.from({ length: 101 }, (_, index) => ({
				title: `Row ${index + 1}`,
			})),
		}),
		isApiError(400, ApiErrorCode.VALIDATION),
	);
});

test("routes serve CSV with download headers and block frozen orgs", async () => {
	const deps = setup();
	const app = buildApp(deps);
	const exported = await app.request(
		`/api/orgs/${ORG}/projects/${PROJECT}/issues/export.csv`,
	);
	assert.equal(exported.status, 200);
	assert.match(exported.headers.get("content-type") ?? "", /^text\/csv/);
	assert.match(
		exported.headers.get("content-disposition") ?? "",
		/WEB-issues\.csv/,
	);
	assert.equal(exported.headers.get("x-issue-truncated"), "false");
	const exportedBody = await exported.text();
	// UTF-8 BOM so Excel detects the encoding for non-ASCII titles.
	assert.equal(exportedBody.charCodeAt(0), 0xfeff);
	assert.match(exportedBody, /Fix ""quoted"", comma/);

	const imported = await app.request(
		`/api/orgs/${ORG}/projects/${PROJECT}/issues/import`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ rows: [{ title: "Via route" }] }),
		},
	);
	assert.equal(imported.status, 200);
	const body = (await imported.json()) as {
		ok: boolean;
		data: { created: number; errors: unknown[] };
	};
	assert.equal(body.ok, true);
	assert.equal(body.data.created, 1);
	assert.deepEqual(body.data.errors, []);

	// Cross-org: the project belongs to ORG, not ORG-2.
	const crossOrg = await app.request(
		`/api/orgs/${OTHER_ORG}/projects/${PROJECT}/issues/export.csv`,
	);
	assert.equal(crossOrg.status, 404);

	deps.sqlite.run("UPDATE organization SET frozen = 1 WHERE id = ?", ORG);
	const frozen = await app.request(
		`/api/orgs/${ORG}/projects/${PROJECT}/issues/import`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ rows: [{ title: "Blocked" }] }),
		},
	);
	assert.equal(frozen.status, 403);
	const frozenBody = (await frozen.json()) as { error: { code: string } };
	assert.equal(frozenBody.error.code, "ORG_FROZEN");
});
