import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
	addFavorite,
	favoritesQuery,
	isFavorited,
	removeFavorite,
} from "../src/features/favorites/data";
import {
	archiveIssue,
	invalidateIssueQueries,
	issueArchiveAction,
	restoreIssue,
} from "../src/features/issues/data";
import {
	buildIssueListParams,
	issueQueryKey,
	resolveIssueQuery,
} from "../src/features/issues/query";
import { issueSearchSchema } from "../src/features/issues/search";
import { favoritesRootKey } from "../src/features/keys";

interface RequestRecord {
	url: URL;
	method: string;
	body: unknown;
}

async function withRequests(
	respond: () => Response,
	run: (requests: RequestRecord[]) => Promise<void>,
) {
	const original = globalThis.fetch;
	const requests: RequestRecord[] = [];
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(
				input instanceof Request ? input.url : String(input),
				"http://localhost",
			);
			const body =
				typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
			requests.push({ url, method: init?.method ?? "GET", body });
			return respond();
		},
		{ preconnect: original.preconnect },
	) as typeof fetch;
	try {
		await run(requests);
	} finally {
		globalThis.fetch = original;
	}
}

const ok = (data: unknown) => Response.json({ ok: true, data });

test("favorites use the org-scoped favorites cache key", () => {
	assert.deepEqual(favoritesRootKey("org"), ["orgs", "org", "favorites"]);
	assert.deepEqual(favoritesQuery("org").queryKey, [
		"orgs",
		"org",
		"favorites",
	]);
	assert.notDeepEqual(favoritesRootKey("org"), favoritesRootKey("other"));
});

test("isFavorited matches by entity type and id only", () => {
	const items = [
		{ entityType: "issue", entityId: "i1" },
		{ entityType: "project", entityId: "p1" },
	] as never;
	assert.equal(isFavorited(items, "issue", "i1"), true);
	assert.equal(isFavorited(items, "project", "p1"), true);
	// A project id must not match an issue favorite with the same id.
	assert.equal(isFavorited(items, "project", "i1"), false);
	assert.equal(isFavorited(undefined, "issue", "i1"), false);
});

test("favorite add/remove requests carry the validated entity variables", () =>
	withRequests(
		() => ok({ id: "favorite" }),
		async (requests) => {
			await addFavorite("org", { entityType: "issue", entityId: "issue-1" });
			await removeFavorite("org", "project", "project-1");

			assert.equal(requests[0].url.pathname, "/api/orgs/org/favorites");
			assert.equal(requests[0].method, "POST");
			assert.deepEqual(requests[0].body, {
				entityType: "issue",
				entityId: "issue-1",
			});
			assert.equal(
				requests[1].url.pathname,
				"/api/orgs/org/favorites/project/project-1",
			);
			assert.equal(requests[1].method, "DELETE");
		},
	));

test("archive/restore requests hit the issue archive endpoints", () =>
	withRequests(
		() => ok({ id: "issue" }),
		async (requests) => {
			await archiveIssue("org", "project", 7);
			await restoreIssue("org", "project", 7);

			assert.equal(
				requests[0].url.pathname,
				"/api/orgs/org/projects/project/issues/7/archive",
			);
			assert.equal(requests[0].method, "POST");
			assert.equal(
				requests[1].url.pathname,
				"/api/orgs/org/projects/project/issues/7/restore",
			);
			assert.equal(requests[1].method, "POST");
		},
	));

test("archived URL param is a boolean defaulting to false", () => {
	assert.equal(issueSearchSchema.parse({}).includeArchived, undefined);
	assert.equal(
		issueSearchSchema.parse({ includeArchived: "true" }).includeArchived,
		true,
	);
	assert.equal(
		issueSearchSchema.parse({ includeArchived: "1" }).includeArchived,
		true,
	);
	assert.equal(
		issueSearchSchema.parse({ includeArchived: true }).includeArchived,
		true,
	);
	assert.equal(
		issueSearchSchema.parse({ includeArchived: "false" }).includeArchived,
		undefined,
	);
	assert.equal(
		issueSearchSchema.parse({ includeArchived: "nope" }).includeArchived,
		undefined,
	);
});

test("includeArchived reaches the request and splits cache keys", () => {
	const resolved = resolveIssueQuery({});
	const hidden = buildIssueListParams({
		...resolved,
		page: 1,
		pageSize: 20,
	});
	assert.equal(hidden.includeArchived, undefined);

	const shown = buildIssueListParams({
		...resolved,
		includeArchived: true,
		page: 1,
		pageSize: 20,
	});
	assert.equal(shown.includeArchived, "true");

	assert.equal(issueQueryKey(resolved).includeArchived, false);
	assert.equal(
		issueQueryKey({ ...resolved, includeArchived: true }).includeArchived,
		true,
	);
	assert.notDeepEqual(
		issueQueryKey(resolved),
		issueQueryKey({ ...resolved, includeArchived: true }),
	);
});

test("archive writes invalidate lists, details, search, stats and favorites", async () => {
	const client = new QueryClient();
	const affected = [
		// issue lists and org-wide search
		["orgs", "org", "issues"],
		["orgs", "org", "issues", "search", "all", "bug"],
		// project root covers project stats, cycle progress and issue details
		["orgs", "org", "projects"],
		["orgs", "org", "projects", "project"],
		["orgs", "org", "projects", "project", "cycles"],
		["orgs", "org", "projects", "project", "issues", { page: 1 }],
		["orgs", "org", "projects", "project", "issues", "detail", 1],
		["orgs", "org", "projects", "project", "issues", "detail", 1, "activities"],
		["orgs", "org", "activities", { limit: 50 }],
		["orgs", "org", "roadmap"],
		// pinned issue/project rows change with archive state
		["orgs", "org", "favorites"],
	];
	const unaffected = [
		["orgs", "other", "issues"],
		["orgs", "other", "favorites"],
		["orgs", "org", "members"],
	];
	for (const key of [...affected, ...unaffected]) client.setQueryData(key, {});
	await invalidateIssueQueries(client, "org");
	for (const key of affected)
		assert.equal(client.getQueryState(key)?.isInvalidated, true, String(key));
	for (const key of unaffected)
		assert.equal(client.getQueryState(key)?.isInvalidated, false, String(key));
	client.clear();
});

test("archive menu action maps archived state to restore", () => {
	assert.equal(issueArchiveAction({ archivedAt: null }), "archive");
	assert.equal(issueArchiveAction({}), "archive");
	assert.equal(
		issueArchiveAction({ archivedAt: "2026-01-01T00:00:00.000Z" }),
		"restore",
	);
});
