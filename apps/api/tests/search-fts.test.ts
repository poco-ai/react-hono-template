import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Guards the FTS5 index defined in `drizzle/fts/search_fts.sql`.
 *
 * The virtual tables are re-runnable, but SQLite drops every trigger on
 * `issues`/`comments` when a migration rebuilds those tables (D1 does rebuilds
 * as create/copy/drop/rename). Without the triggers the index silently stops
 * updating, so the file has to be re-executed after such a migration. These
 * tests assert the six triggers exist, that they keep the external content in
 * sync, and that re-running the file restores search after a simulated rebuild.
 */
const FTS_SQL = readFileSync(
	fileURLToPath(new URL("../drizzle/fts/search_fts.sql", import.meta.url).href),
	"utf8",
);

const PARENT_DDL = `
CREATE TABLE issues (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	project_id text NOT NULL,
	number integer NOT NULL,
	title text NOT NULL,
	description text,
	status_id text NOT NULL,
	priority integer NOT NULL DEFAULT 0,
	assignee_id text,
	deleted_at integer,
	updated_at integer NOT NULL
);
CREATE TABLE comments (
	id text PRIMARY KEY,
	org_id text NOT NULL,
	issue_id text NOT NULL,
	author_id text NOT NULL,
	body text NOT NULL,
	created_at integer NOT NULL
);
`;

const EXPECTED_TRIGGERS = [
	"issue_search_ai",
	"issue_search_ad",
	"issue_search_au",
	"comment_search_ai",
	"comment_search_ad",
	"comment_search_au",
];

const NOW = 1_700_000_000_000;

const setup = () => {
	const sqlite = new Database(":memory:");
	sqlite.exec(PARENT_DDL);
	sqlite.exec(FTS_SQL);
	return sqlite;
};

const triggerNames = (sqlite: Database) =>
	(
		sqlite
			.query("SELECT name FROM sqlite_master WHERE type = 'trigger'")
			.all() as { name: string }[]
	).map((row) => row.name);

const ftsQuery = (quoted: string) => `"${quoted.replace(/"/g, '""')}"`;

const issueRowIds = (sqlite: Database, term: string) =>
	(
		sqlite
			.query(
				"SELECT rowid FROM issue_search WHERE issue_search MATCH ? ORDER BY rowid",
			)
			.all(ftsQuery(term)) as { rowid: number }[]
	).map((row) => row.rowid);

const commentRowIds = (sqlite: Database, term: string) =>
	(
		sqlite
			.query(
				"SELECT rowid FROM comment_search WHERE comment_search MATCH ? ORDER BY rowid",
			)
			.all(ftsQuery(term)) as { rowid: number }[]
	).map((row) => row.rowid);

const addIssue = (
	sqlite: Database,
	row: {
		id: string;
		title: string;
		description?: string | null;
		deletedAt?: number | null;
	},
) =>
	sqlite.run(
		"INSERT INTO issues (id, org_id, project_id, number, title, description, status_id, priority, assignee_id, deleted_at, updated_at) VALUES (?, 'org', 'project-1', 1, ?, ?, 'status-1', 0, NULL, ?, ?)",
		row.id,
		row.title,
		row.description ?? null,
		row.deletedAt ?? null,
		NOW,
	);

const addComment = (sqlite: Database, id: string, body: string) =>
	sqlite.run(
		"INSERT INTO comments (id, org_id, issue_id, author_id, body, created_at) VALUES (?, 'org', 'issue-1', 'user-1', ?, ?)",
		id,
		body,
		NOW,
	);

test("search_fts.sql is re-runnable and defines all six sync triggers", () => {
	const sqlite = setup();
	// Idempotent: the file may be re-executed after every table rebuild.
	sqlite.exec(FTS_SQL);

	assert.deepEqual(triggerNames(sqlite).sort(), [...EXPECTED_TRIGGERS].sort());
	assert.deepEqual(
		(
			sqlite
				.query(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('issue_search', 'comment_search')",
				)
				.all() as { name: string }[]
		)
			.map((row) => row.name)
			.sort(),
		["comment_search", "issue_search"],
	);

	// Both indexes are structurally valid after the rebuild.
	sqlite.exec(
		"INSERT INTO issue_search(issue_search) VALUES('integrity-check')",
	);
	sqlite.exec(
		"INSERT INTO comment_search(comment_search) VALUES('integrity-check')",
	);
});

test("insert, update and delete triggers keep the external content index in sync", () => {
	const sqlite = setup();
	addIssue(sqlite, {
		id: "issue-1",
		title: "Login fails",
		description: "Users cannot sign in",
	});
	addComment(sqlite, "comment-1", "Please fix the login flow");

	assert.deepEqual(issueRowIds(sqlite, "login"), [1]);
	assert.deepEqual(issueRowIds(sqlite, "sign"), [1], "description is indexed");
	assert.deepEqual(commentRowIds(sqlite, "login"), [1]);

	// AFTER UPDATE OF title, description removes the old row and inserts the new.
	sqlite.run(
		"UPDATE issues SET title = 'Checkout crashes', description = 'Refund broken' WHERE id = 'issue-1'",
	);
	assert.deepEqual(issueRowIds(sqlite, "login"), []);
	assert.deepEqual(issueRowIds(sqlite, "sign"), []);
	assert.deepEqual(issueRowIds(sqlite, "checkout"), [1]);
	assert.deepEqual(issueRowIds(sqlite, "refund"), [1]);

	// An update of an unrelated column must not disturb the index.
	sqlite.run("UPDATE issues SET priority = 3 WHERE id = 'issue-1'");
	assert.deepEqual(issueRowIds(sqlite, "checkout"), [1]);

	sqlite.run(
		"UPDATE comments SET body = 'Refund flow fixed' WHERE id = 'comment-1'",
	);
	assert.deepEqual(commentRowIds(sqlite, "login"), []);
	assert.deepEqual(commentRowIds(sqlite, "refund"), [1]);

	// AFTER DELETE removes the FTS row, so hard deletes never leave stale hits.
	sqlite.run("DELETE FROM issues WHERE id = 'issue-1'");
	sqlite.run("DELETE FROM comments WHERE id = 'comment-1'");
	assert.deepEqual(issueRowIds(sqlite, "checkout"), []);
	assert.deepEqual(commentRowIds(sqlite, "refund"), []);
});

test("re-running search_fts.sql after a parent-table rebuild restores triggers and search", () => {
	const sqlite = setup();
	addIssue(sqlite, { id: "issue-1", title: "Login fails" });
	addComment(sqlite, "comment-1", "Login note");
	assert.deepEqual(issueRowIds(sqlite, "login"), [1]);
	assert.deepEqual(commentRowIds(sqlite, "login"), [1]);

	// Simulate a drizzle-kit migration rebuilding both parent tables: the
	// virtual tables survive, the triggers do not.
	sqlite.exec("DROP TABLE issues");
	sqlite.exec("DROP TABLE comments");
	sqlite.exec(PARENT_DDL);
	assert.deepEqual(triggerNames(sqlite), [], "rebuild drops every trigger");

	// Re-running the recovery file recreates the triggers and rebuilds the
	// index from the (empty) parent tables, clearing stale rows.
	sqlite.exec(FTS_SQL);
	assert.deepEqual(triggerNames(sqlite).sort(), [...EXPECTED_TRIGGERS].sort());
	assert.deepEqual(issueRowIds(sqlite, "login"), []);
	assert.deepEqual(commentRowIds(sqlite, "login"), []);

	// The restored triggers index new writes again.
	addIssue(sqlite, { id: "issue-2", title: "Payment timeout" });
	addComment(sqlite, "comment-2", "Payment note");
	assert.deepEqual(issueRowIds(sqlite, "payment"), [1]);
	assert.deepEqual(commentRowIds(sqlite, "payment"), [1]);
	sqlite.exec(
		"INSERT INTO issue_search(issue_search) VALUES('integrity-check')",
	);
	sqlite.exec(
		"INSERT INTO comment_search(comment_search) VALUES('integrity-check')",
	);
});
