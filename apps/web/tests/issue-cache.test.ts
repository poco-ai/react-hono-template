import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { invalidateIssueQueries } from "../src/features/issues/data";
import { issueSearchSchema } from "../src/features/issues/search";

test("issue writes invalidate lists, details and activities only in their organization", async () => {
	const client = new QueryClient();
	const affected = [
		["orgs", "org", "projects"],
		["orgs", "org", "projects", "project", "issues", { page: 1 }],
		["orgs", "org", "projects", "project", "issues", "detail", 1],
		["orgs", "org", "projects", "project", "issues", "detail", 1, "activities"],
		["orgs", "org", "issues"],
		["orgs", "org", "activities", { limit: 50 }],
	];
	const unaffected = [
		["orgs", "other", "projects"],
		["orgs", "org", "members"],
	];
	for (const key of [...affected, ...unaffected]) client.setQueryData(key, {});
	await invalidateIssueQueries(client, "org");
	for (const key of affected)
		assert.equal(client.getQueryState(key)?.isInvalidated, true);
	for (const key of unaffected)
		assert.equal(client.getQueryState(key)?.isInvalidated, false);
	client.clear();
});

test("issue URL state preserves legacy board links and invalid-value defaults", () => {
	assert.equal(issueSearchSchema.parse({ view: "kanban" }).view, "board");
	const invalid = issueSearchSchema.parse({
		page: -1,
		sort: "wrong",
		view: "wrong",
	});
	assert.equal(invalid.page, 1);
	assert.equal(invalid.sort, "updated");
	assert.equal(invalid.view, "list");
});
