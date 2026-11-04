import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode, roadmapQuerySchema } from "@workspace/shared";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createRoadmapDao } from "../src/dao/roadmap.dao";
import type { Database as AppDatabase } from "../src/db/types";
import {
	createRoadmapService,
	resolveRoadmapWindow,
} from "../src/services/roadmap.service";

/**
 * Roadmap aggregate: project/cycle/issue-stat SQL runs against in-memory
 * SQLite, so the window overlap, archived-project exclusion, per-cycle
 * progress and project issue counts are exercised for real.
 */

const ORG = "org";
const OTHER_ORG = "org-2";
const PROJECT = "p1";
const ARCHIVED_PROJECT = "p2";
const OTHER_PROJECT = "p3";
const NOW = new Date("2026-06-15T12:00:00.000Z");

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
`;

const ms = (value: string) => Date.parse(value);

const setup = () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(DDL);
	for (const [id, orgId, key, archived] of [
		[PROJECT, ORG, "WEB", 0],
		[ARCHIVED_PROJECT, ORG, "OLD", 1],
		[OTHER_PROJECT, OTHER_ORG, "OTH", 0],
	] as const) {
		sqlite.run(
			"INSERT INTO projects (id, org_id, name, key, archived, color, health, target_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			id,
			orgId,
			`Project ${id}`,
			key,
			archived,
			"#123456",
			"on_track",
			ms("2026-08-01T00:00:00Z"),
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
	addCycle(
		"c-may",
		"May",
		1,
		"2026-05-01T00:00:00Z",
		"2026-05-31T23:59:59.999Z",
	);
	addCycle(
		"c-june",
		"June",
		2,
		"2026-06-01T00:00:00Z",
		"2026-06-30T23:59:59.999Z",
	);
	addCycle("c-old", "Old", 3, "2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z");
	// Starts exactly at the exclusive window end: outside the window.
	addCycle(
		"c-dec",
		"December",
		5,
		"2026-12-01T00:00:00Z",
		"2026-12-15T00:00:00Z",
	);
	addCycle(
		"c-archived",
		"Archived project",
		1,
		"2026-06-01T00:00:00Z",
		"2026-06-10T00:00:00Z",
		ARCHIVED_PROJECT,
	);
	addCycle(
		"c-other-org",
		"Other org",
		1,
		"2026-06-01T00:00:00Z",
		"2026-06-10T00:00:00Z",
		OTHER_PROJECT,
		OTHER_ORG,
	);

	const addIssue = (
		id: string,
		number: number,
		statusId: string,
		cycleId: string | null,
		projectId = PROJECT,
		orgId = ORG,
		archived = false,
	) => {
		sqlite.run(
			"INSERT INTO issues (id, org_id, project_id, number, title, status_id, cycle_id, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			id,
			orgId,
			projectId,
			number,
			`Issue ${id}`,
			statusId,
			cycleId,
			archived ? ms("2026-06-02T00:00:00Z") : null,
			ms("2026-06-01T00:00:00Z"),
			ms("2026-06-01T00:00:00Z"),
		);
	};
	addIssue("i1", 1, "s-todo", "c-june");
	addIssue("i2", 2, "s-done", "c-june");
	addIssue("i3", 3, "s-canceled", "c-june");
	addIssue("i4", 4, "s-todo", "c-may");
	// Archived issues are excluded from progress and project statistics.
	addIssue("i5", 5, "s-done", "c-june", PROJECT, ORG, true);
	addIssue("i6", 1, "s-todo", "c-archived", ARCHIVED_PROJECT);

	const db = Object.assign(drizzle({ client: sqlite }), {
		batch: async (statements: unknown[]) => {
			const results: unknown[] = [];
			for (const statement of statements) {
				results.push(await statement);
			}
			return results;
		},
	});
	const roadmapDao = createRoadmapDao(db as unknown as AppDatabase);
	const roadmapService = createRoadmapService({
		roadmapDao,
		now: () => NOW,
	});
	return { sqlite, roadmapService };
};

test("roadmap defaults to one month back through five months ahead", () => {
	const window = resolveRoadmapWindow({}, NOW);
	assert.equal(window.from.toISOString(), "2026-05-01T00:00:00.000Z");
	assert.equal(window.to.toISOString(), "2026-12-01T00:00:00.000Z");
	assert.equal(window.truncated, false);
});

test("roadmap window clamps to 12 months and rejects inverted ranges", () => {
	const clamped = resolveRoadmapWindow(
		{ from: "2025-01-01", to: "2026-12-31" },
		NOW,
	);
	assert.equal(clamped.from.toISOString(), "2025-01-01T00:00:00.000Z");
	assert.equal(clamped.to.toISOString(), "2026-01-01T00:00:00.000Z");
	assert.equal(clamped.truncated, true);

	assert.throws(
		() => resolveRoadmapWindow({ from: "2026-06-10", to: "2026-06-01" }, NOW),
		(error: unknown) =>
			error instanceof ApiError &&
			error.status === 400 &&
			error.code === ApiErrorCode.VALIDATION,
	);
});

test("roadmap query rejects non-ISO dates", () => {
	assert.equal(
		roadmapQuerySchema.safeParse({ from: "2026-06-01" }).success,
		true,
	);
	assert.equal(
		roadmapQuerySchema.safeParse({ from: "06/01/2026" }).success,
		false,
	);
	assert.equal(
		roadmapQuerySchema.safeParse({ from: "2026-13-01" }).success,
		false,
	);
	assert.equal(
		roadmapQuerySchema.safeParse({ from: "2026-06-02", to: "2026-06-01" })
			.success,
		false,
	);
});

test("roadmap returns active projects with window cycles and progress", async () => {
	const { roadmapService } = setup();
	const roadmap = await roadmapService.getRoadmap(ORG, {});

	assert.deepEqual(
		roadmap.projects.map((project) => project.id),
		[PROJECT],
	);
	const project = roadmap.projects[0];
	assert.equal(project.key, "WEB");
	assert.equal(project.color, "#123456");
	assert.equal(project.health, "on_track");
	assert.equal(project.targetDate, "2026-08-01T00:00:00.000Z");
	// i1-i4 are active; i5 is archived, i6 belongs to another project.
	assert.deepEqual(project.issueCount, { total: 4, open: 2 });

	assert.deepEqual(
		project.cycles.map((cycle) => cycle.id),
		["c-may", "c-june"],
	);
	const june = project.cycles[1];
	assert.equal(june.name, "June");
	assert.equal(june.status, "current");
	assert.deepEqual(june.progress, { total: 3, terminal: 2, percent: 67 });
	const may = project.cycles[0];
	assert.equal(may.status, "past");
	assert.deepEqual(may.progress, { total: 1, terminal: 0, percent: 0 });
});

test("roadmap honors an explicit window and excludes archived projects", async () => {
	const { roadmapService } = setup();
	const roadmap = await roadmapService.getRoadmap(ORG, {
		from: "2026-03-01",
		to: "2026-03-31",
	});
	assert.equal(roadmap.projects.length, 1);
	assert.deepEqual(
		roadmap.projects[0].cycles.map((cycle) => cycle.id),
		["c-old"],
	);
	assert.equal(roadmap.projects[0].cycles[0].status, "past");
});
