import assert from "node:assert/strict";
import { test } from "node:test";
import type { OrgActivityDto } from "@api/dto/activity.dto";
import { QueryClient } from "@tanstack/react-query";
import {
	fetchOrgActivities,
	flattenActivityPages,
	ORG_ACTIVITY_PAGE_SIZE,
	orgActivitiesInfiniteQuery,
	orgActivitiesKey,
	orgActivitiesRootKey,
} from "../src/features/activities/data";

interface RequestRecord {
	url: URL;
	method: string;
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
			requests.push({ url, method: init?.method ?? "GET" });
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

const activity = (id: string, project = "project-1") =>
	({ id, projectId: project }) as unknown as OrgActivityDto;

const pagesResponse = (count: number, start = 0) =>
	Response.json({
		ok: true,
		data: Array.from({ length: count }, (_value, index) =>
			activity(`a${start + index}`),
		),
	});

test("activity keys stay under the org resource root and split by project", () => {
	assert.deepEqual(orgActivitiesRootKey("org"), ["orgs", "org", "activities"]);
	const all = orgActivitiesKey("org");
	const filtered = orgActivitiesKey("org", { projectId: "project-1" });
	assert.deepEqual(
		[...all],
		["orgs", "org", "activities", "list", { projectId: null }],
	);
	assert.notDeepEqual(all, filtered);
	// Both remain covered by root invalidation.
	assert.deepEqual([...all].slice(0, 3), [...orgActivitiesRootKey("org")]);
});

test("infinite feed requests the first page with offset zero", async () => {
	await withRequests(
		() => pagesResponse(ORG_ACTIVITY_PAGE_SIZE),
		async (requests) => {
			const client = new QueryClient();
			const result = await client.fetchInfiniteQuery(
				orgActivitiesInfiniteQuery("org", { projectId: "project-1" }),
			);
			assert.equal(result.pages.length, 1);
			assert.equal(requests[0]?.url.searchParams.get("offset"), "0");
			assert.equal(
				requests[0]?.url.searchParams.get("limit"),
				String(ORG_ACTIVITY_PAGE_SIZE),
			);
			assert.equal(requests[0]?.url.searchParams.get("projectId"), "project-1");
		},
	);
});

test("next page offsets advance by the page size and stop on a short page", async () => {
	await withRequests(
		() => pagesResponse(ORG_ACTIVITY_PAGE_SIZE),
		async (requests) => {
			await fetchOrgActivities("org", {
				offset: ORG_ACTIVITY_PAGE_SIZE,
			});
			assert.equal(
				requests[0]?.url.searchParams.get("offset"),
				String(ORG_ACTIVITY_PAGE_SIZE),
			);
			assert.equal(requests[0]?.url.searchParams.get("limit"), "30");
		},
	);

	const options = orgActivitiesInfiniteQuery("org");
	type Params = Parameters<NonNullable<typeof options.getNextPageParam>>;
	const next = (...args: unknown[]) =>
		options.getNextPageParam(...(args as Params));
	const full = Array.from({ length: ORG_ACTIVITY_PAGE_SIZE }, () =>
		activity("a"),
	);
	const short = full.slice(0, 5);

	assert.equal(next(full, [full], 0, [0]), ORG_ACTIVITY_PAGE_SIZE);
	assert.equal(
		next(full, [full, full], ORG_ACTIVITY_PAGE_SIZE, [
			0,
			ORG_ACTIVITY_PAGE_SIZE,
		]),
		ORG_ACTIVITY_PAGE_SIZE * 2,
	);
	assert.equal(next(short, [short], 30, [30]), undefined);
	assert.equal(
		next([], [[]], 60, [60]),
		undefined,
		"an empty page ends paging",
	);
});

test("changing the project filter uses a fresh cache entry and offset zero", async () => {
	await withRequests(
		() => pagesResponse(2),
		async (requests) => {
			const client = new QueryClient();
			await client.fetchInfiniteQuery(orgActivitiesInfiniteQuery("org"));
			await client.fetchInfiniteQuery(
				orgActivitiesInfiniteQuery("org", { projectId: "project-2" }),
			);
			assert.equal(requests.length, 2, "the filtered feed refetches");
			assert.equal(requests[0]?.url.searchParams.get("projectId"), null);
			assert.equal(requests[1]?.url.searchParams.get("projectId"), "project-2");
			assert.equal(
				requests[1]?.url.searchParams.get("offset"),
				"0",
				"the filtered feed restarts from the newest row",
			);
			assert.ok(
				client.getQueryState(
					orgActivitiesKey("org", { projectId: "project-2" }),
				),
				"the filtered feed has its own cache entry",
			);
		},
	);
});

test("flattening pages keeps order and drops duplicate activities", () => {
	const pages = [
		[activity("a1"), activity("a2"), activity("a3")],
		[activity("a3"), activity("a4")],
	];
	assert.deepEqual(
		flattenActivityPages(pages).map((item) => item.id),
		["a1", "a2", "a3", "a4"],
	);
	assert.deepEqual(flattenActivityPages([]), []);
	assert.deepEqual(flattenActivityPages(undefined), []);
});
