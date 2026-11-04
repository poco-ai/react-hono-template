import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	createCycleSchema,
	createIssueSchema,
	DEFAULT_RUNTIME_CONFIG,
	issueFilterNodeSchema,
	updateCycleSchema,
} from "@workspace/shared";
import { drizzle } from "drizzle-orm/bun-sqlite";
import {
	type CapabilityDeps,
	createCapabilityRegistry,
} from "../src/capabilities";
import { createCycleDao } from "../src/dao/cycle.dao";
import { createIssueDao } from "../src/dao/issue.dao";
import { createProjectDao } from "../src/dao/project.dao";
import type { Database as AppDatabase } from "../src/db/types";
import type { Dependencies } from "../src/dependencies";
import type { Auth } from "../src/lib/auth";
import { createRoutes } from "../src/routes";
import {
	assertCycleAssignable,
	createCycleService,
	cycleStatus,
} from "../src/services/cycle.service";

/**
 * Cycles: time-range validation, per-project numbering, derived status and
 * progress, rollover into a later cycle and the cycleId issue filter. DAO and
 * service run against in-memory SQLite so the SQL (overlap window, terminal
 * status subquery, activity INSERT ... SELECT) is exercised for real.
 */

const ORG = "org";
const OTHER_ORG = "org-2";
const PROJECT = "p1";
const OTHER_PROJECT = "p2";
const NOW = new Date("2026-06-01T00:00:00.000Z");

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
CREATE UNIQUE INDEX cycles_projectId_number_uq ON cycles (project_id, number);
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
`;

const ms = (value: string) => Date.parse(value);

const setup = () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(DDL);
	for (const [id, orgId, key] of [
		[PROJECT, ORG, "WEB"],
		[OTHER_PROJECT, ORG, "API"],
		["p3", OTHER_ORG, "OTH"],
	] as const) {
		sqlite.run(
			"INSERT INTO projects (id, org_id, name, key) VALUES (?, ?, ?, ?)",
			id,
			orgId,
			`Project ${id}`,
			key,
		);
	}
	for (const [id, category] of [
		["s-todo", "unstarted"],
		["s-done", "completed"],
		["s-canceled", "canceled"],
	] as const) {
		sqlite.run(
			"INSERT INTO issue_statuses (id, org_id, name, category) VALUES (?, ?, ?, ?)",
			id,
			ORG,
			id,
			category,
		);
	}
	const addCycle = (
		id: string,
		name: string,
		number: number,
		startsAt: string,
		endsAt: string,
		projectId = PROJECT,
		orgId = ORG,
	) => {
		sqlite.run(
			"INSERT INTO cycles (id, org_id, project_id, name, number, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			id,
			orgId,
			projectId,
			name,
			number,
			ms(startsAt),
			ms(endsAt),
		);
	};
	addCycle("c-past", "Past", 1, "2026-01-01T00:00:00Z", "2026-01-10T00:00:00Z");
	addCycle(
		"c-current",
		"Current",
		2,
		"2026-05-01T00:00:00Z",
		"2026-06-14T23:59:59.999Z",
	);
	addCycle(
		"c-upcoming",
		"Upcoming",
		3,
		"2026-07-01T00:00:00Z",
		"2026-07-15T00:00:00Z",
	);
	addCycle(
		"c-other-project",
		"Other",
		4,
		"2026-08-01T00:00:00Z",
		"2026-08-15T00:00:00Z",
		OTHER_PROJECT,
	);
	const addIssue = (
		id: string,
		number: number,
		statusId: string,
		cycleId: string | null,
		projectId = PROJECT,
		orgId = ORG,
	) => {
		sqlite.run(
			"INSERT INTO issues (id, org_id, project_id, number, title, status_id, cycle_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			id,
			orgId,
			projectId,
			number,
			`Issue ${id}`,
			statusId,
			cycleId,
			ms("2026-05-01T00:00:00Z"),
			ms("2026-05-01T00:00:00Z"),
		);
	};
	addIssue("i1", 1, "s-todo", "c-current");
	addIssue("i2", 2, "s-done", "c-current");
	addIssue("i3", 3, "s-canceled", "c-current");
	addIssue("i4", 4, "s-todo", null);
	// Soft-deleted issues are ignored by progress, rollover and delete activity.
	sqlite.run(
		"INSERT INTO issues (id, org_id, project_id, number, title, status_id, cycle_id, deleted_at, created_at, updated_at) VALUES ('i5', ?, ?, 5, 'Issue i5', 's-todo', 'c-current', ?, ?, ?)",
		ORG,
		PROJECT,
		ms("2026-05-20T00:00:00Z"),
		ms("2026-05-01T00:00:00Z"),
		ms("2026-05-01T00:00:00Z"),
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
	const appDb = db as unknown as AppDatabase;
	const cycleDao = createCycleDao(appDb);
	const issueDao = createIssueDao(appDb);
	const projectDao = createProjectDao(appDb);
	const cycleService = createCycleService({
		cycleDao,
		projectDao,
		now: () => NOW,
	});
	return { sqlite, cycleDao, issueDao, projectDao, cycleService };
};

const isApiError = (status: number, code: ApiErrorCode) => (error: unknown) =>
	error instanceof ApiError && error.status === status && error.code === code;

test("cycle status is derived from dates with inclusive current bounds", () => {
	assert.equal(
		cycleStatus("2026-06-01T00:00:00Z", "2026-06-10T00:00:00Z", NOW),
		"current",
	);
	assert.equal(
		cycleStatus("2026-06-02T00:00:00Z", "2026-06-10T00:00:00Z", NOW),
		"upcoming",
	);
	assert.equal(
		cycleStatus("2026-05-01T00:00:00Z", "2026-05-31T00:00:00Z", NOW),
		"past",
	);
	assert.equal(
		cycleStatus(
			"2026-05-01T00:00:00Z",
			"2026-06-01T00:00:00Z",
			"2026-06-01T00:00:00Z",
		),
		"current",
	);
	// The last millisecond of the end day is still current (inclusive end).
	assert.equal(
		cycleStatus(
			"2026-01-01T00:00:00Z",
			"2026-06-30T23:59:59.999Z",
			"2026-06-30T23:59:59.999Z",
		),
		"current",
	);
	assert.equal(
		cycleStatus(
			"2026-01-01T00:00:00Z",
			"2026-06-30T23:59:59.999Z",
			"2026-07-01T00:00:00.000Z",
		),
		"past",
	);
});

test("createCycle validates the range and rejects overlapping cycles", async () => {
	const { cycleService } = setup();
	await assert.rejects(
		cycleService.createCycle(ORG, PROJECT, "user-1", {
			name: "Bad",
			startsAt: "2026-09-10T00:00:00Z",
			endsAt: "2026-09-10T00:00:00Z",
		}),
		isApiError(400, ApiErrorCode.CYCLE_RANGE_INVALID),
	);
	await assert.rejects(
		cycleService.createCycle(ORG, PROJECT, "user-1", {
			name: "Overlap",
			startsAt: "2026-06-10T00:00:00Z",
			endsAt: "2026-06-20T00:00:00Z",
		}),
		isApiError(409, ApiErrorCode.CYCLE_OVERLAP),
	);
	// Ranges that only touch are not overlapping.
	const touching = await cycleService.createCycle(ORG, PROJECT, "user-1", {
		name: "Touching",
		startsAt: "2026-06-15T00:00:00Z",
		endsAt: "2026-06-30T00:00:00Z",
	});
	assert.equal(touching.name, "Touching");
	assert.equal(touching.number, 4);
	// Closed ranges: sharing the exact boundary millisecond does overlap.
	await assert.rejects(
		cycleService.createCycle(ORG, PROJECT, "user-1", {
			name: "Shared edge",
			startsAt: "2026-06-14T23:59:59.999Z",
			endsAt: "2026-06-30T00:00:00Z",
		}),
		isApiError(409, ApiErrorCode.CYCLE_OVERLAP),
	);
});

test("updateCycle excludes itself from the overlap check", async () => {
	const { cycleService } = setup();
	const updated = await cycleService.updateCycle(ORG, PROJECT, "c-current", {
		name: "Current renamed",
		startsAt: "2026-05-01T00:00:00Z",
		endsAt: "2026-06-14T23:59:59.999Z",
	});
	assert.equal(updated.name, "Current renamed");
	assert.equal(updated.number, 2);
	// Expanding into the next cycle is still rejected.
	await assert.rejects(
		cycleService.updateCycle(ORG, PROJECT, "c-current", {
			endsAt: "2026-07-02T00:00:00Z",
		}),
		isApiError(409, ApiErrorCode.CYCLE_OVERLAP),
	);
});

test("cycle numbers increment per project and stay isolated across projects", async () => {
	const { cycleService } = setup();
	const first = await cycleService.createCycle(ORG, OTHER_PROJECT, "user-1", {
		name: "First",
		startsAt: "2026-09-01T00:00:00Z",
		endsAt: "2026-09-10T00:00:00Z",
	});
	const second = await cycleService.createCycle(ORG, OTHER_PROJECT, "user-1", {
		name: "Second",
		startsAt: "2026-09-11T00:00:00Z",
		endsAt: "2026-09-20T00:00:00Z",
	});
	// p2 already has one seeded cycle (number 4).
	assert.equal(first.number, 5);
	assert.equal(second.number, 6);
	// p1's numbering is independent (three seeded cycles).
	const web = await cycleService.createCycle(ORG, PROJECT, "user-1", {
		name: "Web",
		startsAt: "2026-09-01T00:00:00Z",
		endsAt: "2026-09-10T00:00:00Z",
	});
	assert.equal(web.number, 4);
});

test("listCycles filters by derived status and reports progress", async () => {
	const { cycleService } = setup();
	const all = await cycleService.listCycles(ORG, PROJECT, {
		status: "all",
		page: 1,
		pageSize: 20,
	});
	assert.deepEqual(
		all.items.map((cycle) => [cycle.name, cycle.status]),
		[
			["Past", "past"],
			["Current", "current"],
			["Upcoming", "upcoming"],
		],
	);
	const current = all.items.find((cycle) => cycle.id === "c-current");
	assert.ok(current);
	// i1 unstarted, i2 completed, i3 canceled → 2 of 3 terminal = 67%.
	assert.deepEqual(current.progress, { total: 3, terminal: 2, percent: 67 });

	const upcoming = await cycleService.listCycles(ORG, PROJECT, {
		status: "upcoming",
		page: 1,
		pageSize: 20,
	});
	assert.deepEqual(
		upcoming.items.map((cycle) => cycle.id),
		["c-upcoming"],
	);
	assert.equal(upcoming.total, 1);

	const paged = await cycleService.listCycles(ORG, PROJECT, {
		status: "all",
		page: 2,
		pageSize: 2,
	});
	assert.deepEqual(
		paged.items.map((cycle) => cycle.id),
		["c-upcoming"],
	);
	assert.equal(paged.total, 3);
});

test("rollover moves only non-terminal issues and records cycle activity", async () => {
	const { sqlite, cycleService } = setup();
	const result = await cycleService.rolloverCycle(
		ORG,
		PROJECT,
		"c-current",
		"user-1",
		{ targetCycleId: "c-upcoming" },
	);
	assert.deepEqual(result, {
		sourceCycleId: "c-current",
		targetCycleId: "c-upcoming",
		moved: 1,
	});
	const moved = sqlite
		.query("SELECT id, cycle_id FROM issues ORDER BY id")
		.all() as { id: string; cycle_id: string | null }[];
	assert.deepEqual(
		moved.map((row) => [row.id, row.cycle_id]),
		[
			["i1", "c-upcoming"],
			["i2", "c-current"],
			["i3", "c-current"],
			["i4", null],
			["i5", "c-current"],
		],
	);
	const activities = sqlite
		.query(
			"SELECT issue_id, action, field, old_value, new_value FROM activities",
		)
		.all() as {
		issue_id: string;
		action: string;
		field: string;
		old_value: string;
		new_value: string;
	}[];
	assert.deepEqual(activities, [
		{
			issue_id: "i1",
			action: "issue.updated",
			field: "cycle",
			old_value: "Current",
			new_value: "Upcoming",
		},
	]);
	// Re-running rollover is a no-op: the only movable issue already moved.
	const again = await cycleService.rolloverCycle(
		ORG,
		PROJECT,
		"c-current",
		"user-1",
		{ targetCycleId: "c-upcoming" },
	);
	assert.equal(again.moved, 0);
	assert.equal(
		(
			sqlite.query("SELECT count(*) AS count FROM activities").get() as {
				count: number;
			}
		).count,
		1,
	);
});

test("rollover rejects ended, missing and cross-project targets", async () => {
	const { cycleService } = setup();
	await assert.rejects(
		cycleService.rolloverCycle(ORG, PROJECT, "c-current", "user-1", {
			targetCycleId: "c-past",
		}),
		isApiError(400, ApiErrorCode.CYCLE_TARGET_INVALID),
	);
	await assert.rejects(
		cycleService.rolloverCycle(ORG, PROJECT, "c-current", "user-1", {
			targetCycleId: "c-current",
		}),
		isApiError(400, ApiErrorCode.CYCLE_TARGET_INVALID),
	);
	// A cycle of another project is not visible in this project's scope.
	await assert.rejects(
		cycleService.rolloverCycle(ORG, PROJECT, "c-current", "user-1", {
			targetCycleId: "c-other-project",
		}),
		isApiError(404, ApiErrorCode.CYCLE_NOT_FOUND),
	);
});

test("a target cycle ending exactly now is still a valid rollover target", async () => {
	const { sqlite, cycleService } = setup();
	sqlite.run(
		"UPDATE cycles SET starts_at = ?, ends_at = ? WHERE id = 'c-upcoming'",
		ms("2026-05-20T00:00:00Z"),
		NOW.getTime(),
	);
	const result = await cycleService.rolloverCycle(
		ORG,
		PROJECT,
		"c-current",
		"user-1",
		{ targetCycleId: "c-upcoming" },
	);
	assert.equal(result.moved, 1);
});

test("deleting a cycle detaches its issues and records cycle activity", async () => {
	const { sqlite, cycleService } = setup();
	await cycleService.deleteCycle(ORG, PROJECT, "c-current", "user-1");
	assert.equal(
		(
			sqlite.query("SELECT count(*) AS count FROM cycles").get() as {
				count: number;
			}
		).count,
		3,
	);
	const rows = sqlite
		.query("SELECT id, cycle_id FROM issues WHERE id IN ('i1','i2','i3')")
		.all() as { id: string; cycle_id: string | null }[];
	assert.equal(rows.length, 3);
	assert.ok(rows.every((row) => row.cycle_id === null));
	// One activity row per non-deleted attached issue, with a null new value.
	const activities = sqlite
		.query(
			"SELECT issue_id, action, field, old_value, new_value FROM activities ORDER BY issue_id",
		)
		.all() as {
		issue_id: string;
		action: string;
		field: string;
		old_value: string;
		new_value: string | null;
	}[];
	assert.deepEqual(activities, [
		{
			issue_id: "i1",
			action: "issue.updated",
			field: "cycle",
			old_value: "Current",
			new_value: null,
		},
		{
			issue_id: "i2",
			action: "issue.updated",
			field: "cycle",
			old_value: "Current",
			new_value: null,
		},
		{
			issue_id: "i3",
			action: "issue.updated",
			field: "cycle",
			old_value: "Current",
			new_value: null,
		},
	]);
});

test("cycles are org-scoped and must match the issue's project", async () => {
	const { cycleDao } = setup();
	await assert.rejects(
		assertCycleAssignable(cycleDao, OTHER_ORG, "p3", "c-current"),
		isApiError(404, ApiErrorCode.CYCLE_NOT_FOUND),
	);
	await assert.rejects(
		assertCycleAssignable(cycleDao, ORG, OTHER_PROJECT, "c-current"),
		isApiError(400, ApiErrorCode.VALIDATION),
	);
	const cycle = await assertCycleAssignable(
		cycleDao,
		ORG,
		PROJECT,
		"c-current",
	);
	assert.equal(cycle.id, "c-current");
});

test("issue list supports cycleId eq/in/isNull filters", async () => {
	const { issueDao } = setup();
	const run = async (filter: Record<string, unknown>) => {
		const page = await issueDao.list(ORG, null, {
			page: 1,
			pageSize: 20,
			sort: "updated",
			filter: filter as never,
		});
		return page.items.map((issue) => issue.id).sort();
	};
	assert.deepEqual(
		await run({
			type: "condition",
			field: "cycleId",
			operator: "eq",
			value: "c-current",
		}),
		["i1", "i2", "i3"],
	);
	assert.deepEqual(
		await run({
			type: "condition",
			field: "cycleId",
			operator: "in",
			value: ["c-current", "c-upcoming"],
		}),
		["i1", "i2", "i3"],
	);
	assert.deepEqual(
		await run({ type: "condition", field: "cycleId", operator: "isNull" }),
		["i4"],
	);
	// Legacy flat filters keep working alongside the new field.
	const legacy = await issueDao.list(ORG, null, {
		page: 1,
		pageSize: 20,
		sort: "updated",
		statusId: ["s-todo"],
	});
	assert.deepEqual(legacy.items.map((issue) => issue.id).sort(), ["i1", "i4"]);
});

test("cycle and issue schemas accept cycleId and reject bad ranges", () => {
	assert.equal(
		createCycleSchema.safeParse({
			name: "Sprint",
			startsAt: "2026-01-01T00:00:00Z",
			endsAt: "2026-01-10T00:00:00Z",
		}).success,
		true,
	);
	assert.equal(
		createCycleSchema.safeParse({
			name: "Sprint",
			startsAt: "2026-01-10T00:00:00Z",
			endsAt: "2026-01-01T00:00:00Z",
		}).success,
		false,
	);
	assert.equal(updateCycleSchema.safeParse({ name: "Renamed" }).success, true);
	assert.equal(
		createIssueSchema.safeParse({ title: "Issue", cycleId: "c-1" }).success,
		true,
	);
	assert.equal(
		issueFilterNodeSchema.safeParse({
			type: "condition",
			field: "cycleId",
			operator: "isNull",
		}).success,
		true,
	);
	assert.equal(
		issueFilterNodeSchema.safeParse({
			type: "condition",
			field: "cycleId",
			operator: "between",
			value: ["a", "b"],
		}).success,
		false,
	);
});

test("cycle capabilities are registered as read/write tools", () => {
	const deps = {
		services: {
			cycleService: {
				listCycles: async () => ({
					items: [],
					total: 0,
					page: 1,
					pageSize: 20,
				}),
				createCycle: async () => {
					throw new Error("not used");
				},
			},
			projectUpdateService: {
				listUpdates: async () => ({
					items: [],
					total: 0,
					page: 1,
					pageSize: 20,
				}),
				createUpdate: async () => {
					throw new Error("not used");
				},
			},
		},
		daos: {},
	} as unknown as CapabilityDeps;
	const registry = createCapabilityRegistry(deps);
	const byName = new Map(registry.map((entry) => [entry.name, entry]));
	assert.equal(byName.get("list_cycles")?.effect, "read");
	assert.deepEqual(byName.get("list_cycles")?.scopes, ["read"]);
	assert.equal(byName.get("create_cycle")?.effect, "write");
	assert.deepEqual(byName.get("create_cycle")?.scopes, ["write"]);
	assert.equal(byName.get("list_project_updates")?.effect, "read");
	assert.equal(byName.get("create_project_update")?.effect, "write");
});

// ---------------------------------------------------------------------------
// Route middleware: org scoping and freeze handling
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
			getSession: async () => ({ user: { id: "user", role: "user" } }),
		},
	} as unknown as Auth;
	const notUsed = async () => {
		throw new Error("service should not be called");
	};
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
				createCycle: async (orgId: string, projectId: string) => ({
					id: "c1",
					orgId,
					projectId,
				}),
				updateCycle: async (orgId: string, projectId: string) => ({
					id: "c1",
					orgId,
					projectId,
				}),
				deleteCycle: async () => undefined,
				rolloverCycle: async () => ({ moved: 0 }),
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

test("cycle routes are org-scoped and respect the freeze guard", async () => {
	const nonMember = appFor({ member: false });
	assert.equal(
		(await nonMember.request("/api/orgs/org/projects/p/cycles")).status,
		404,
	);

	const frozen = appFor({ frozen: true });
	assert.equal(
		(await frozen.request("/api/orgs/org/projects/p/cycles")).status,
		200,
	);
	const blocked = await frozen.request("/api/orgs/org/projects/p/cycles", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			name: "Sprint",
			startsAt: "2026-01-01T00:00:00Z",
			endsAt: "2026-01-10T00:00:00Z",
		}),
	});
	assert.equal(blocked.status, 403);
	const body = (await blocked.json()) as { error: { code: string } };
	assert.equal(body.error.code, "ORG_FROZEN");

	const member = appFor();
	const response = await member.request("/api/orgs/org/projects/p/cycles");
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		ok: true,
		data: { items: [], total: 0, page: 1, pageSize: 20 },
	});
	const invalid = await appFor({ role: "admin" }).request(
		"/api/orgs/org/projects/p/cycles",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: "",
				startsAt: "2026-01-01T00:00:00Z",
				endsAt: "2026-01-10T00:00:00Z",
			}),
		},
	);
	assert.equal(invalid.status, 400);
});

test("cycle writes require owner or admin", async () => {
	const base = "/api/orgs/org/projects/p/cycles";
	const writes: [string, string, Record<string, unknown> | null][] = [
		[
			"POST",
			base,
			{
				name: "Sprint",
				startsAt: "2026-01-01T00:00:00Z",
				endsAt: "2026-01-10T23:59:59.999Z",
			},
		],
		["PATCH", `${base}/c1`, { name: "Renamed" }],
		["DELETE", `${base}/c1`, null],
		["POST", `${base}/c1/rollover`, { targetCycleId: "c2" }],
	];
	const member = appFor();
	for (const [method, path, payload] of writes) {
		const response = await member.request(path, {
			method,
			...(payload
				? {
						headers: { "content-type": "application/json" },
						body: JSON.stringify(payload),
					}
				: {}),
		});
		assert.equal(response.status, 403, `${method} ${path} as member`);
		const body = (await response.json()) as { error: { code: string } };
		assert.equal(body.error.code, "FORBIDDEN");
	}

	const admin = appFor({ role: "admin" });
	for (const [method, path, payload] of writes) {
		const response = await admin.request(path, {
			method,
			...(payload
				? {
						headers: { "content-type": "application/json" },
						body: JSON.stringify(payload),
					}
				: {}),
		});
		assert.equal(response.status, 200, `${method} ${path} as admin`);
	}
});
