import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import {
	isIssueNumberConflict,
	isUniqueConstraintViolation,
} from "../src/core/lib/db-errors";
import { labels } from "../src/db/schema";
import { seedOrganization, seedProject, seedStatus } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

/**
 * drizzle-orm 1.0 RC wraps driver errors in `DrizzleQueryError`, whose
 * `message` only contains the SQL text; the SQLite constraint text lives in
 * `cause`. These tests pin the cause-chain behaviour that the services rely on
 * to turn uniqueness races into 409/409-style ApiErrors instead of 500s.
 */
const uniqueLabel = {
	id: "label-1",
	orgId: "org-1",
	name: "Bug",
};

/** The pre-fix implementation: only the top-level message was inspected. */
const matchesTopLevelMessage = (err: unknown) =>
	err instanceof Error && /unique constraint/i.test(err.message);

test("detects a real UNIQUE violation wrapped by drizzle", async () => {
	const { db } = createTestDb();
	await db.insert(labels).values(uniqueLabel);

	let thrown: unknown;
	try {
		await db.insert(labels).values({ ...uniqueLabel, id: "label-2" });
	} catch (err) {
		thrown = err;
	}

	assert.ok(thrown instanceof Error);
	assert.match(thrown.message, /failed query/i);
	// The top-level message alone never carries the constraint name, which is
	// exactly why the old regex-based checks fell through to a 500.
	assert.equal(matchesTopLevelMessage(thrown), false);
	assert.equal(isUniqueConstraintViolation(thrown), true);
});

test("does not treat CHECK constraint failures as UNIQUE violations", async () => {
	const { sqlite, db } = createTestDb();
	sqlite.exec(
		"CREATE TABLE check_probe (value integer NOT NULL CHECK (value > 0))",
	);

	let thrown: unknown;
	try {
		await db.run(sql`INSERT INTO check_probe (value) VALUES (-1)`);
	} catch (err) {
		thrown = err;
	}

	assert.ok(thrown instanceof Error);
	assert.equal(matchesTopLevelMessage(thrown), false);
	assert.equal(isUniqueConstraintViolation(thrown), false);
});

test("walks the cause chain without overflowing on cycles", () => {
	assert.equal(isUniqueConstraintViolation(null), false);
	assert.equal(isUniqueConstraintViolation("UNIQUE constraint failed"), false);

	const first = new Error("first");
	const second = new Error("second", { cause: first });
	// Build a cycle that would recurse forever without a visited set.
	(first as { cause?: unknown }).cause = second;
	assert.equal(isUniqueConstraintViolation(second), false);

	const selfReferencing = new Error("self");
	(selfReferencing as { cause?: unknown }).cause = selfReferencing;
	assert.equal(isUniqueConstraintViolation(selfReferencing), false);
});

test("matches a real issue-number unique violation from SQLite", () => {
	const { sqlite } = createTestDb();
	seedOrganization(sqlite, { id: "org-1" });
	seedProject(sqlite, { id: "project-1", orgId: "org-1" });
	seedStatus(sqlite, { id: "status-1", orgId: "org-1" });
	const insert = (id: string) =>
		sqlite.run(
			`INSERT INTO issues (id, org_id, project_id, number, title, status_id)
			 VALUES (?, 'org-1', 'project-1', 1, 'Issue', 'status-1')`,
			id,
		);
	insert("issue-1");

	let thrown: unknown;
	try {
		insert("issue-2");
	} catch (err) {
		thrown = err;
	}
	assert.ok(thrown instanceof Error);
	assert.equal(isIssueNumberConflict(thrown), true);
});

test("only the issue number index is treated as a retryable collision", () => {
	const wrapped = (message: string) =>
		new Error("failed query", { cause: new Error(message) });

	assert.equal(
		isIssueNumberConflict(
			wrapped("UNIQUE constraint failed: issues.project_id, issues.number"),
		),
		true,
	);
	assert.equal(
		isIssueNumberConflict(
			wrapped(
				"UNIQUE constraint failed: issue_labels.issue_id, issue_labels.label_id",
			),
		),
		false,
	);
	assert.equal(
		isIssueNumberConflict(
			wrapped("UNIQUE constraint failed: projects.org_id, projects.key"),
		),
		false,
	);
});
