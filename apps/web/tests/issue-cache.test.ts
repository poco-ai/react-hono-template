import assert from "node:assert/strict";
import { test } from "node:test";
import type { IssueDetailDto } from "@api/dto/issue.dto";
import type { StatusDto } from "@api/dto/status.dto";
import { QueryClient } from "@tanstack/react-query";
import {
	applyIssueUpdate,
	invalidateBulkIssueQueries,
	invalidateIssueQueries,
	invalidateRelationQueries,
} from "../src/features/issues/data";
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

test("relation writes invalidate detail, relation groups, activity and org feeds", async () => {
	const client = new QueryClient();
	const affected = [
		["orgs", "org", "projects", "project", "issues", "detail", 1],
		["orgs", "org", "projects", "project", "issues", "detail", 1, "relations"],
		["orgs", "org", "projects", "project", "issues", "detail", 1, "activities"],
		["orgs", "org", "projects", "project", "issues", { page: 1 }],
		["orgs", "org", "issues"],
		["orgs", "org", "activities", { limit: 50 }],
	];
	const unaffected = [
		// `invalidateIssueQueries` invalidates the org's project root (which
		// covers every detail key in the org); only other orgs stay untouched.
		["orgs", "other", "issues"],
		["orgs", "other", "projects"],
		["orgs", "org", "members"],
	];
	for (const key of [...affected, ...unaffected]) client.setQueryData(key, {});
	await invalidateRelationQueries(client, "org", "project", 1);
	for (const key of affected)
		assert.equal(client.getQueryState(key)?.isInvalidated, true, String(key));
	for (const key of unaffected)
		assert.equal(client.getQueryState(key)?.isInvalidated, false, String(key));
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

test("inline updates patch a list row immutably and resolve the status object", () => {
	const status = { id: "s2", name: "Done" } as StatusDto;
	const issue = {
		id: "i1",
		statusId: "s1",
		status: { id: "s1", name: "Todo" } as StatusDto,
		priority: 0,
		assigneeId: null,
		dueDate: null,
		estimate: null,
		labelIds: ["l1"],
	} as unknown as IssueDetailDto;

	const patched = applyIssueUpdate(
		issue,
		{
			statusId: "s2",
			priority: 2,
			assigneeId: "u1",
			dueDate: "2026-01-01",
			estimate: 3,
			labelIds: ["l2"],
		},
		status,
	);
	assert.equal(patched.statusId, "s2");
	assert.equal(patched.status, status);
	assert.equal(patched.priority, 2);
	assert.equal(patched.assigneeId, "u1");
	assert.equal(patched.dueDate, "2026-01-01");
	assert.equal(patched.estimate, 3);
	assert.deepEqual(patched.labelIds, ["l2"]);
	// The cached row is never mutated in place.
	assert.equal(issue.statusId, "s1");
	assert.deepEqual(issue.labelIds, ["l1"]);
});

test("bulk writes invalidate lists, details and activity feeds", async () => {
	const client = new QueryClient();
	const affected = [
		["orgs", "org", "issues"],
		["orgs", "org", "projects", "project", "issues", { page: 1 }],
		["orgs", "org", "projects", "project", "issues", "detail", 1],
		["orgs", "org", "projects", "project", "issues", "detail", 1, "activities"],
		["orgs", "org", "activities", { limit: 50 }],
	];
	const unaffected = [
		["orgs", "other", "issues"],
		["orgs", "org", "members"],
	];
	for (const key of [...affected, ...unaffected]) client.setQueryData(key, {});
	await invalidateBulkIssueQueries(client, "org", "project");
	for (const key of affected)
		assert.equal(client.getQueryState(key)?.isInvalidated, true, String(key));
	for (const key of unaffected)
		assert.equal(client.getQueryState(key)?.isInvalidated, false, String(key));
	client.clear();
});
