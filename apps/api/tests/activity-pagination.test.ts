import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ACTIVITY_OFFSET_MAX,
	activityListQuerySchema,
} from "@workspace/shared";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createActivityDao } from "../src/dao/activity.dao";
import type { Database as AppDatabase } from "../src/db/types";

/**
 * Organization activity pagination: `offset` validation bounds, DAO
 * offset+limit windows, empty final page and backward compatibility for
 * callers that only send `limit`.
 */
const DDL = `
CREATE TABLE user (
	id text PRIMARY KEY,
	name text NOT NULL,
	email text NOT NULL,
	image text
);
CREATE TABLE issues (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	number integer NOT NULL,
	title text NOT NULL
);
CREATE TABLE projects (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	key text NOT NULL,
	name text NOT NULL
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
	created_at integer NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
`;

const setup = () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(DDL);
	sqlite.run(
		"INSERT INTO user (id, name, email, image) VALUES ('user-1', 'Ada', 'ada@example.com', NULL)",
	);
	sqlite.run(
		"INSERT INTO projects (id, org_id, key, name) VALUES ('project-1', 'org', 'WEB', 'Web'), ('project-2', 'org', 'API', 'API')",
	);
	const db = drizzle({ client: sqlite });
	return { sqlite, db: db as unknown as AppDatabase };
};

/** Inserts one activity per issue number; timestamps grow with the number. */
const addActivity = (
	sqlite: Database,
	row: {
		id: string;
		issueNumber: number;
		projectId?: string;
		orgId?: string;
		createdAt?: number;
	},
) => {
	const issueId = `issue-${row.id}`;
	sqlite.run(
		"INSERT INTO issues (id, org_id, number, title) VALUES (?, ?, ?, ?)",
		issueId,
		row.orgId ?? "org",
		row.issueNumber,
		`Issue ${row.issueNumber}`,
	);
	sqlite.run(
		`INSERT INTO activities (id, org_id, project_id, issue_id, actor_id, action, created_at)
		 VALUES (?, ?, ?, ?, 'user-1', 'issue.updated', ?)`,
		row.id,
		row.orgId ?? "org",
		row.projectId ?? "project-1",
		issueId,
		row.createdAt ?? 1000 + row.issueNumber,
	);
};

test("activity query offset defaults to zero and rejects out-of-range values", () => {
	assert.equal(activityListQuerySchema.parse({}).offset, 0);
	assert.equal(activityListQuerySchema.parse({ offset: "20" }).offset, 20);
	assert.equal(activityListQuerySchema.parse({ offset: 0 }).limit, 50);
	assert.equal(
		activityListQuerySchema.parse({ limit: "1" }).limit,
		1,
		"minimum page size",
	);
	assert.equal(
		activityListQuerySchema.parse({ offset: String(ACTIVITY_OFFSET_MAX) })
			.offset,
		ACTIVITY_OFFSET_MAX,
	);
	assert.equal(
		activityListQuerySchema.safeParse({ offset: -1 }).success,
		false,
		"negative offsets are rejected",
	);
	assert.equal(
		activityListQuerySchema.safeParse({ offset: ACTIVITY_OFFSET_MAX + 1 })
			.success,
		false,
		"offsets beyond the guard are rejected",
	);
	assert.equal(
		activityListQuerySchema.safeParse({ offset: "1.5" }).success,
		false,
		"fractional offsets are rejected",
	);
});

test("org activity pages walk the newest-first list with offset and limit", async () => {
	const { sqlite, db } = setup();
	for (let number = 1; number <= 5; number += 1) {
		addActivity(sqlite, { id: `a${number}`, issueNumber: number });
	}
	const dao = createActivityDao(db);

	const first = await dao.listByOrg("org", { limit: 2, offset: 0 });
	assert.deepEqual(
		first.map((activity) => activity.id),
		["a5", "a4"],
	);
	const second = await dao.listByOrg("org", { limit: 2, offset: 2 });
	assert.deepEqual(
		second.map((activity) => activity.id),
		["a3", "a2"],
	);
	const last = await dao.listByOrg("org", { limit: 2, offset: 4 });
	assert.deepEqual(
		last.map((activity) => activity.id),
		["a1"],
		"short final page signals the end of the list",
	);
	const empty = await dao.listByOrg("org", { limit: 2, offset: 6 });
	assert.deepEqual(empty, [], "an offset past the end returns an empty page");

	// Joined data still hydrates on every page.
	assert.equal(last[0]?.issue?.number, 1);
	assert.equal(last[0]?.project?.key, "WEB");
});

test("legacy requests without offset keep returning the first page", async () => {
	const { sqlite, db } = setup();
	for (let number = 1; number <= 4; number += 1) {
		addActivity(sqlite, { id: `a${number}`, issueNumber: number });
	}
	const dao = createActivityDao(db);

	const rows = await dao.listByOrg("org", { limit: 3 });
	assert.deepEqual(
		rows.map((activity) => activity.id),
		["a4", "a3", "a2"],
	);
});

test("offset pagination respects the project filter and org scope", async () => {
	const { sqlite, db } = setup();
	addActivity(sqlite, { id: "p1-a", issueNumber: 1, projectId: "project-1" });
	addActivity(sqlite, { id: "p1-b", issueNumber: 2, projectId: "project-1" });
	addActivity(sqlite, { id: "p2-a", issueNumber: 3, projectId: "project-2" });
	addActivity(sqlite, {
		id: "p2-b",
		issueNumber: 4,
		projectId: "project-2",
		createdAt: 10_000,
	});
	addActivity(sqlite, {
		id: "other-a",
		issueNumber: 5,
		orgId: "other",
		createdAt: 20_000,
	});
	const dao = createActivityDao(db);

	const page = await dao.listByOrg("org", {
		projectId: "project-2",
		limit: 1,
		offset: 1,
	});
	assert.deepEqual(
		page.map((activity) => activity.id),
		["p2-a"],
	);
	const filtered = await dao.listByOrg("org", {
		projectId: "project-2",
		limit: 5,
		offset: 0,
	});
	assert.deepEqual(
		filtered.map((activity) => activity.id),
		["p2-b", "p2-a"],
	);
});
