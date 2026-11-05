import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { viewsKey } from "../src/features/keys";
import { invalidateViewQueries } from "../src/features/views/data";

async function verifyInvalidation(
	invalidate: (client: QueryClient) => Promise<unknown>,
	affected: readonly unknown[][],
	unaffected: readonly unknown[][],
) {
	const client = new QueryClient();
	try {
		for (const key of [...affected, ...unaffected]) {
			client.setQueryData(key, {});
		}
		await invalidate(client);
		for (const key of affected) {
			assert.equal(client.getQueryState(key)?.isInvalidated, true, String(key));
		}
		for (const key of unaffected) {
			assert.equal(
				client.getQueryState(key)?.isInvalidated,
				false,
				String(key),
			);
		}
	} finally {
		client.clear();
	}
}

const issueList = [
	"orgs",
	"org",
	"projects",
	"project",
	"issues",
	{ filter: null, page: 1 },
];
const orgIssues = ["orgs", "org", "issues", { filter: null, page: 1 }];

test("view writes refresh view lists and applied issue lists", () =>
	verifyInvalidation(
		(client) => invalidateViewQueries(client, "org"),
		[
			["orgs", "org", "views"],
			["orgs", "org", "views", "project"],
			issueList,
			orgIssues,
		],
		[
			["orgs", "other", "views"],
			["orgs", "other", "projects"],
			["orgs", "org", "members"],
		],
	));

test("changing only the default view leaves issue caches untouched", () =>
	verifyInvalidation(
		(client) => invalidateViewQueries(client, "org", { issues: false }),
		[
			["orgs", "org", "views"],
			["orgs", "org", "views", "project"],
		],
		[issueList, orgIssues, ["orgs", "other", "views"]],
	));

test("view list keys are project-scoped under the organization root", () => {
	assert.deepEqual(viewsKey("org"), ["orgs", "org", "views"]);
	assert.deepEqual(viewsKey("org", "project"), [
		"orgs",
		"org",
		"views",
		"project",
	]);
});
