import type { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createIssueDao } from "../src/dao/issue.dao";
import { createRelationDao } from "../src/dao/relation.dao";
import { isUniqueConstraintViolation } from "../src/lib/db-errors";
import { seedIssue } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

/**
 * DAO integration tests against an in-memory SQLite database built from the
 * real migrations. They exercise the real SQL (soft-delete cascade, recursive
 * blocks traversal, unique-index mapping) instead of mocking it away.
 */

const setup = () => {
	const { sqlite, db } = createTestDb();
	return { sqlite, db };
};

const addIssue = (
	sqlite: Database,
	row: { id: string; parentId?: string | null },
) =>
	seedIssue(sqlite, {
		id: row.id,
		orgId: "org",
		projectId: "project-1",
		statusId: "status-default",
		parentId: row.parentId ?? null,
	});

const countRows = (sqlite: Database, table: string) =>
	(
		sqlite.query(`SELECT count(*) AS value FROM ${table}`).get() as {
			value: number;
		}
	).value;

const activity = {
	id: "activity-1",
	orgId: "org",
	projectId: "project-1",
	issueId: "issue-1",
	actorId: "user-1",
	action: "issue.updated",
	field: "relation:related",
	oldValue: "WEB-2",
	newValue: null,
};

test("soft delete detaches children and removes relations from both sides", async () => {
	const { sqlite, db } = setup();
	const issueDao = createIssueDao(db);
	addIssue(sqlite, { id: "parent" });
	addIssue(sqlite, { id: "child", parentId: "parent" });
	addIssue(sqlite, { id: "peer" });
	const relationDao = createRelationDao(db);
	await relationDao.create({
		id: "r-parent",
		orgId: "org",
		issueId: "parent",
		relatedIssueId: "peer",
		type: "blocks",
		createdById: null,
	});
	await relationDao.create({
		id: "r-child",
		orgId: "org",
		issueId: "child",
		relatedIssueId: "peer",
		type: "related",
		createdById: null,
	});

	await issueDao.softDelete("org", "parent", {
		...activity,
		id: "activity-deleted",
		issueId: "parent",
		action: "issue.deleted",
		field: null,
		oldValue: null,
	});

	assert.equal(
		(
			sqlite.query("SELECT parent_id FROM issues WHERE id = 'child'").get() as {
				parent_id: string | null;
			}
		).parent_id,
		null,
		"child parent is cleared",
	);
	assert.equal(
		(await relationDao.listByIssue("org", "parent")).length,
		0,
		"relations of the deleted issue are gone",
	);
	assert.equal(
		(await relationDao.listByIssue("org", "child")).length,
		1,
		"unrelated issue keeps its relations",
	);

	// Deleting the peer removes the remaining edge too — no dangling relation.
	await issueDao.softDelete("org", "peer");
	assert.equal((await relationDao.listByIssue("org", "child")).length, 0);
	assert.equal(countRows(sqlite, "issue_relations"), 0);
	assert.equal(countRows(sqlite, "activities"), 1);
});

test("relation dao detects multi-hop blocks paths with one traversal", async () => {
	const { db } = setup();
	const relationDao = createRelationDao(db);
	for (const [id, issueId, relatedIssueId] of [
		["r1", "a", "b"],
		["r2", "b", "c"],
	] as const) {
		await relationDao.create({
			id,
			orgId: "org",
			issueId,
			relatedIssueId,
			type: "blocks",
			createdById: null,
		});
	}

	assert.equal(await relationDao.hasBlocksPath("org", "a", "c"), true);
	assert.equal(await relationDao.hasBlocksPath("org", "a", "b"), true);
	assert.equal(await relationDao.hasBlocksPath("org", "c", "a"), false);
});

test("relation lists are stably ordered and unique clashes map to a 409", async () => {
	const { sqlite, db } = setup();
	const relationDao = createRelationDao(db);
	for (const id of ["r-z", "r-a"]) {
		await relationDao.create({
			id,
			orgId: "org",
			issueId: "issue-1",
			relatedIssueId: `peer-${id}`,
			type: "related",
			createdById: null,
		});
	}
	// Pin timestamps so the primary created_at ordering is deterministic.
	sqlite.run("UPDATE issue_relations SET created_at = 2 WHERE id = 'r-z'");
	sqlite.run("UPDATE issue_relations SET created_at = 1 WHERE id = 'r-a'");
	const rows = await relationDao.listByIssue("org", "issue-1");
	assert.deepEqual(
		rows.map((row) => row.id),
		["r-a", "r-z"],
	);

	// Equal timestamps fall back to the id tie-breaker.
	await relationDao.create({
		id: "r-b",
		orgId: "org",
		issueId: "issue-1",
		relatedIssueId: "peer-r-b",
		type: "related",
		createdById: null,
	});
	sqlite.run("UPDATE issue_relations SET created_at = 1 WHERE id = 'r-b'");
	const tiedRows = await relationDao.listByIssue("org", "issue-1");
	assert.deepEqual(
		tiedRows.map((row) => row.id),
		["r-a", "r-b", "r-z"],
	);

	// The DAO propagates the raw unique-index violation; the service maps it
	// to the 409 ISSUE_RELATION_EXISTS (see relations.test.ts).
	await assert.rejects(
		relationDao.create({
			id: "r-duplicate",
			orgId: "org",
			issueId: "issue-1",
			relatedIssueId: "peer-r-a",
			type: "related",
			createdById: null,
		}),
		(err) => isUniqueConstraintViolation(err),
	);

	// Deleting the same row twice writes no activity the second time.
	assert.ok(await relationDao.delete("org", "r-a", activity));
	assert.equal(await relationDao.delete("org", "r-a", activity), null);
	assert.equal(countRows(sqlite, "activities"), 1);
});
