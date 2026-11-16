import type { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createIssueDao } from "../src/dao/issue.dao";
import { seedOrganization, seedProject, seedStatus } from "./helpers/fixtures";
import { createTestDb } from "./helpers/test-db";

const seed = () => {
	const { sqlite, db } = createTestDb();
	seedOrganization(sqlite, { id: "org-1" });
	seedProject(sqlite, { id: "project-1", orgId: "org-1" });
	seedStatus(sqlite, { id: "status-1", orgId: "org-1" });
	for (const id of ["label-1", "label-2"]) {
		sqlite.run(
			"INSERT INTO labels (id, org_id, name) VALUES (?, 'org-1', ?)",
			id,
			id,
		);
	}
	return { sqlite, dao: createIssueDao(db) };
};

const createInput = {
	id: "issue-1",
	orgId: "org-1",
	projectId: "project-1",
	title: "Issue",
	description: null,
	statusId: "status-1",
	priority: 0,
	assigneeId: null,
	createdById: null,
	dueDate: null,
	estimate: null,
	parentId: null,
	cycleId: null,
};

const labelIdsFor = (sqlite: Database, issueId: string) =>
	(
		sqlite
			.query(
				"SELECT label_id FROM issue_labels WHERE issue_id = ? ORDER BY label_id",
			)
			.all(issueId) as { label_id: string }[]
	).map((row) => row.label_id);

test("duplicate label ids are deduplicated on create and update", async () => {
	const { sqlite, dao } = seed();

	const created = await dao.createWithNumber(createInput, [
		"label-1",
		"label-1",
		"label-2",
	]);
	assert.equal(created.number, 1);
	assert.deepEqual(labelIdsFor(sqlite, "issue-1"), ["label-1", "label-2"]);

	await dao.update("org-1", "issue-1", {}, ["label-2", "label-2"]);
	assert.deepEqual(labelIdsFor(sqlite, "issue-1"), ["label-2"]);
});
