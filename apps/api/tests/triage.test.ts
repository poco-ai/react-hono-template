import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createIssueDao } from "../src/dao/issue.dao";
import type { Database as AppDatabase } from "../src/db/types";

/**
 * Triage queue SQL: backlog + unassigned issues from active projects, newest
 * first, with the project filter and creator attribution.
 */

const ORG = "org";
const PROJECT = "p1";
const OTHER_PROJECT = "p2";
const ARCHIVED_PROJECT = "p3";

const DDL = `
CREATE TABLE projects (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	name text NOT NULL,
	key text NOT NULL,
	archived integer NOT NULL DEFAULT 0
);
CREATE TABLE issue_statuses (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	name text NOT NULL,
	category text NOT NULL,
	color text NOT NULL DEFAULT '#000000'
);
CREATE TABLE issues (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	project_id text NOT NULL,
	number integer NOT NULL,
	title text NOT NULL,
	cycle_id text,
	status_id text NOT NULL,
	priority integer NOT NULL DEFAULT 0,
	assignee_id text,
	created_by_id text,
	deleted_at integer,
	archived_at integer,
	created_at integer NOT NULL DEFAULT 0,
	updated_at integer NOT NULL DEFAULT 0
);
`;

const setup = () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(DDL);
	for (const [id, key, archived] of [
		[PROJECT, "WEB", 0],
		[OTHER_PROJECT, "API", 0],
		[ARCHIVED_PROJECT, "OLD", 1],
	] as const) {
		sqlite.run(
			"INSERT INTO projects (id, org_id, name, key, archived) VALUES (?, ?, ?, ?, ?)",
			id,
			ORG,
			`Project ${id}`,
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
	const addIssue = (
		id: string,
		number: number,
		statusId: string,
		projectId: string,
		createdAt: string,
		options: {
			assigneeId?: string;
			archivedAt?: string;
			deletedAt?: string;
			createdById?: string;
		} = {},
	) => {
		sqlite.run(
			"INSERT INTO issues (id, org_id, project_id, number, title, status_id, assignee_id, created_by_id, deleted_at, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			id,
			ORG,
			projectId,
			number,
			`Issue ${id}`,
			statusId,
			options.assigneeId ?? null,
			options.createdById ?? null,
			options.deletedAt ? Date.parse(options.deletedAt) : null,
			options.archivedAt ? Date.parse(options.archivedAt) : null,
			Date.parse(createdAt),
			Date.parse(createdAt),
		);
	};
	addIssue("old", 1, "s-backlog", PROJECT, "2026-05-01T00:00:00Z", {
		createdById: "user-1",
	});
	addIssue("new", 2, "s-backlog", PROJECT, "2026-05-03T00:00:00Z");
	addIssue("other", 1, "s-backlog", OTHER_PROJECT, "2026-05-04T00:00:00Z");
	// Filtered out: assigned, in progress, archived/deleted, archived project.
	addIssue("assigned", 3, "s-backlog", PROJECT, "2026-05-05T00:00:00Z", {
		assigneeId: "user-2",
	});
	addIssue("started", 4, "s-todo", PROJECT, "2026-05-06T00:00:00Z");
	addIssue("archived", 5, "s-backlog", PROJECT, "2026-05-07T00:00:00Z", {
		archivedAt: "2026-05-08T00:00:00Z",
	});
	addIssue("deleted", 6, "s-backlog", PROJECT, "2026-05-08T00:00:00Z", {
		deletedAt: "2026-05-09T00:00:00Z",
	});
	addIssue(
		"hidden-project",
		1,
		"s-backlog",
		ARCHIVED_PROJECT,
		"2026-05-09T00:00:00Z",
	);

	const db = drizzle({ client: sqlite });
	const issueDao = createIssueDao(db as unknown as AppDatabase);
	return { issueDao };
};

test("triage lists backlog + unassigned issues newest first", async () => {
	const { issueDao } = setup();
	const rows = await issueDao.listTriage(ORG);
	assert.deepEqual(
		rows.map((row) => row.id),
		["other", "new", "old"],
	);
	assert.deepEqual(
		rows.map((row) => row.identifier),
		["API-1", "WEB-2", "WEB-1"],
	);
	const old = rows.find((row) => row.id === "old");
	assert.equal(old?.createdById, "user-1");
	assert.equal(old?.statusCategory, "backlog");
	assert.equal(old?.createdAt, "2026-05-01T00:00:00.000Z");
});

test("triage project filter narrows to one project", async () => {
	const { issueDao } = setup();
	const rows = await issueDao.listTriage(ORG, PROJECT);
	assert.deepEqual(
		rows.map((row) => row.id),
		["new", "old"],
	);
	assert.equal(
		rows.every((row) => row.projectId === PROJECT),
		true,
	);
});
