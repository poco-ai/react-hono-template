import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
	buildCreateRecurrenceInput,
	CADENCE_OPTIONS,
	cadenceLabelKey,
	createRecurrence,
	defaultRecurrenceDate,
	deleteRecurrence,
	invalidateRecurrenceQueries,
	recurrenceNextRunAt,
	recurrencesKey,
	updateRecurrence,
} from "../src/features/recurrences/data";

/**
 * Recurring issues web data layer: cache keys/invalidation, request bodies,
 * cadence label mapping and the date defaults used by the dialog.
 */

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

const recurrence = {
	id: "recurrence-1",
	orgId: "org",
	projectId: "project-1",
	title: "Weekly report",
	description: null,
	statusId: "status-1",
	priority: 2,
	assigneeId: null,
	labelIds: [],
	estimate: null,
	cadence: "weekly" as const,
	nextRunAt: "2026-06-02T09:00:00.000Z",
	lastRunAt: null,
	active: true,
	createdById: "user-1",
	createdAt: "2026-06-01T09:00:00.000Z",
	updatedAt: "2026-06-01T09:00:00.000Z",
};

test("recurrencesKey keeps the org/project hierarchy", () => {
	assert.deepEqual(recurrencesKey("org", "project-1"), [
		"orgs",
		"org",
		"projects",
		"project-1",
		"recurrences",
	]);
});

test("writes invalidate recurrences, project issue lists, project stats and the roadmap", async () => {
	const queryClient = new QueryClient();
	const keys: unknown[] = [];
	const original = queryClient.invalidateQueries.bind(queryClient);
	queryClient.invalidateQueries = (async (filters?: unknown) => {
		keys.push((filters as { queryKey?: unknown })?.queryKey);
		return original(filters as never);
	}) as typeof queryClient.invalidateQueries;

	await invalidateRecurrenceQueries(queryClient, "org", "project-1");
	assert.deepEqual(keys, [
		["orgs", "org", "projects", "project-1", "recurrences"],
		["orgs", "org", "projects", "project-1", "issues"],
		["orgs", "org", "projects"],
		["orgs", "org", "roadmap"],
	]);
});

test("createRecurrence posts the cadence and first run under the project", async () => {
	await withRequests(
		() =>
			new Response(JSON.stringify({ ok: true, data: recurrence }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		async (requests) => {
			const created = await createRecurrence("org", "project-1", {
				cadence: "weekly",
				nextRunAt: "2026-06-02T09:00:00.000Z",
			});
			assert.equal(created.id, "recurrence-1");
			assert.equal(requests.length, 1);
			assert.equal(requests[0].method, "POST");
			assert.equal(
				requests[0].url.pathname,
				"/api/orgs/org/projects/project-1/recurrences",
			);
			assert.deepEqual(requests[0].body, {
				cadence: "weekly",
				nextRunAt: "2026-06-02T09:00:00.000Z",
			});
		},
	);
});

test("update and delete target the recurrence id", async () => {
	await withRequests(
		() =>
			new Response(
				JSON.stringify({
					ok: true,
					data: { ...recurrence, active: false },
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		async (requests) => {
			await updateRecurrence("org", "project-1", {
				recurrenceId: "recurrence-1",
				input: { active: false },
			});
			await deleteRecurrence("org", "project-1", "recurrence-1");
			assert.equal(requests[0].method, "PATCH");
			assert.equal(
				requests[0].url.pathname,
				"/api/orgs/org/projects/project-1/recurrences/recurrence-1",
			);
			assert.deepEqual(requests[0].body, { active: false });
			assert.equal(requests[1].method, "DELETE");
			assert.equal(
				requests[1].url.pathname,
				"/api/orgs/org/projects/project-1/recurrences/recurrence-1",
			);
		},
	);
});

test("cadence labels and options map to the recurrences namespace", () => {
	assert.deepEqual(CADENCE_OPTIONS, ["daily", "weekly", "monthly"]);
	assert.equal(cadenceLabelKey("daily"), "recurrences.cadence.daily");
	assert.equal(cadenceLabelKey("weekly"), "recurrences.cadence.weekly");
	assert.equal(cadenceLabelKey("monthly"), "recurrences.cadence.monthly");
});

test("the first run defaults to tomorrow", () => {
	const now = new Date(2026, 4, 31, 15, 30); // local May 31
	assert.equal(defaultRecurrenceDate(now), "2026-06-01");
	assert.equal(defaultRecurrenceDate(new Date(2026, 11, 31, 8)), "2027-01-01");
});

test("recurrenceNextRunAt schedules 09:00 and never returns a past time", () => {
	const now = new Date(2026, 5, 1, 10, 0, 0, 0); // local Jun 1, 10:00
	const future = recurrenceNextRunAt("2026-06-10", now);
	assert.equal(future, new Date(2026, 5, 10, 9, 0, 0, 0).toISOString());
	assert.ok(Date.parse(future) > now.getTime());

	const past = recurrenceNextRunAt("2026-05-01", now);
	assert.equal(past, new Date(2026, 5, 2, 9, 0, 0, 0).toISOString());
	assert.ok(Date.parse(past) > now.getTime());

	// Today at 09:00 is already past, so it rolls to tomorrow.
	const today = recurrenceNextRunAt("2026-06-01", now);
	assert.equal(today, new Date(2026, 5, 2, 9, 0, 0, 0).toISOString());
});

test("buildCreateRecurrenceInput references the issue or sends no title", () => {
	const now = new Date(2026, 5, 1, 10, 0, 0, 0);
	const fromIssue = buildCreateRecurrenceInput({
		cadence: "monthly",
		date: "2026-06-10",
		issueId: "issue-1",
		now,
	});
	assert.deepEqual(fromIssue, {
		issueId: "issue-1",
		cadence: "monthly",
		nextRunAt: new Date(2026, 5, 10, 9, 0, 0, 0).toISOString(),
	});

	const direct = buildCreateRecurrenceInput({
		cadence: "daily",
		date: "2026-06-10",
		now,
	});
	assert.equal("issueId" in direct, false);
	assert.equal(direct.cadence, "daily");
});
