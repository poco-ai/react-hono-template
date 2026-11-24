import assert from "node:assert/strict";
import { test } from "node:test";
import { issueFilterShape, issueListQuerySchema } from "@workspace/shared";
import { listIssuesInputSchema } from "../src/features/capabilities/projections";

const filters = {
	projectId: "project-1",
	statusId: ["status-1"],
	priority: [2],
	assigneeId: "user-1",
	labelId: "label-1",
	search: " text ",
	cycleId: "cycle-1",
	includeArchived: true,
	filter: {
		type: "condition",
		field: "priority",
		operator: "eq",
		value: 2,
	},
};

test("capability issue filters mirror the shared query fields", () => {
	const query = issueListQuerySchema.parse(filters);
	const capability = listIssuesInputSchema.parse(filters);

	for (const key of Object.keys(issueFilterShape)) {
		assert.ok(key in query, `query schema is missing ${key}`);
		assert.ok(key in capability, `capability schema is missing ${key}`);
	}
	for (const key of [
		"projectId",
		"statusId",
		"priority",
		"assigneeId",
		"labelId",
		"search",
		"cycleId",
		"includeArchived",
		"filter",
	] as const) {
		assert.deepEqual(capability[key], query[key], key);
	}
	assert.equal(listIssuesInputSchema.parse({}).includeArchived, false);
});

test("both surfaces still accept the deprecated status names", () => {
	assert.deepEqual(issueListQuerySchema.parse({ status: "todo" }).status, [
		"todo",
	]);
	assert.deepEqual(listIssuesInputSchema.parse({ status: ["todo"] }).status, [
		"todo",
	]);
});
