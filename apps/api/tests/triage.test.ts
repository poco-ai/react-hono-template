import assert from "node:assert/strict";
import { test } from "node:test";
import { createIssueDao } from "../src/features/issues/dao/issue.dao";
import { seedIssue, seedProject, seedStatus } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

/**
 * Triage queue SQL: backlog + unassigned issues from active projects, newest
 * first, with the project filter and creator attribution.
 */

const ORG = "org";
const PROJECT = "p1";
const OTHER_PROJECT = "p2";
const ARCHIVED_PROJECT = "p3";

const setup = () => {
	const { sqlite, db } = createTestDb();
	for (const [id, key, archived] of [
		[PROJECT, "WEB", false],
		[OTHER_PROJECT, "API", false],
		[ARCHIVED_PROJECT, "OLD", true],
	] as const) {
		seedProject(sqlite, {
			id,
			orgId: ORG,
			name: `Project ${id}`,
			key,
			archived,
		});
	}
	for (const [id, category] of [
		["s-backlog", "backlog"],
		["s-todo", "unstarted"],
		["s-done", "completed"],
	] as const) {
		seedStatus(sqlite, { id, orgId: ORG, category });
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
		seedIssue(sqlite, {
			id,
			orgId: ORG,
			projectId,
			number,
			title: `Issue ${id}`,
			statusId,
			assigneeId: options.assigneeId ?? null,
			createdById: options.createdById ?? null,
			deletedAt: options.deletedAt ? Date.parse(options.deletedAt) : null,
			archivedAt: options.archivedAt ? Date.parse(options.archivedAt) : null,
			createdAt: Date.parse(createdAt),
			updatedAt: Date.parse(createdAt),
		});
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

	const issueDao = createIssueDao(db);
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
