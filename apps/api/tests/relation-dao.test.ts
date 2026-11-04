import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createIssueDao } from "../src/dao/issue.dao";
import { createRelationDao } from "../src/dao/relation.dao";
import type { Database as AppDatabase } from "../src/db/types";

/**
 * DAO integration tests against an in-memory SQLite database. They exercise
 * the real SQL (soft-delete cascade, recursive blocks traversal, unique-index
 * mapping) instead of mocking it away.
 *
 * Only the tables/columns touched by these DAOs are created; the DDL mirrors
 * `src/db/schema.ts`.
 */
const DDL = `
CREATE TABLE issues (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	parent_id text,
	deleted_at integer,
	updated_at integer
);
CREATE TABLE issue_relations (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	issue_id text NOT NULL,
	related_issue_id text NOT NULL,
	type text NOT NULL,
	created_by_id text,
	created_at integer NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX issueRelations_issueId_relatedIssueId_type_uq
	ON issue_relations (issue_id, related_issue_id, type);
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
	// Drizzle's bun-sqlite driver (1.0 RC) has no batch(); the DAO contracts are
	// written for D1 batches, so run the statements sequentially (D1 semantics:
	// same transaction).
	const db = Object.assign(drizzle({ client: sqlite }), {
		batch: async (statements: unknown[]) => {
			const results: unknown[] = [];
			for (const statement of statements) {
				results.push(await statement);
			}
			return results;
		},
	});
	return { sqlite, db: db as unknown as AppDatabase };
};

const addIssue = (
	sqlite: Database,
	row: { id: string; parentId?: string | null },
) =>
	sqlite.run(
		"INSERT INTO issues (id, org_id, parent_id, deleted_at) VALUES (?, 'org', ?, NULL)",
		row.id,
		row.parentId ?? null,
	);

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
	const rows = await relationDao.listByIssue("org", "issue-1");
	assert.deepEqual(
		rows.map((row) => row.id),
		["r-a", "r-z"],
	);

	await assert.rejects(
		relationDao.create({
			id: "r-duplicate",
			orgId: "org",
			issueId: "issue-1",
			relatedIssueId: "peer-r-a",
			type: "related",
			createdById: null,
		}),
		(err) =>
			err instanceof ApiError &&
			err.code === ApiErrorCode.ISSUE_RELATION_EXISTS &&
			err.status === 409,
	);

	// Deleting the same row twice writes no activity the second time.
	assert.ok(await relationDao.delete("org", "r-a", activity));
	assert.equal(await relationDao.delete("org", "r-a", activity), null);
	assert.equal(countRows(sqlite, "activities"), 1);
});
