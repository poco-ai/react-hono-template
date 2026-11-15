import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { labels } from "../src/db/schema";
import { isUniqueConstraintViolation } from "../src/lib/db-errors";
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
