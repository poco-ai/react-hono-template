import assert from "node:assert/strict";
import { test } from "node:test";
import {
	BULK_PARTIAL_FAILURE,
	bulkPartialFailure,
} from "../src/features/issues/data";
import { triageKey, triageRootKey } from "../src/features/keys";
import type { TriageIssueDto } from "../src/features/triage/data";
import {
	firstStatusOfCategory,
	resolveTriageProjectFilter,
	runBulkTriage,
	type TriageUpdate,
	triageAction,
	triageActionInput,
	triageAvailability,
	triageSearchSchema,
} from "../src/features/triage/data";
import { errorCode } from "../src/lib/errors";

const statuses = [
	{ id: "s-done", name: "Done", category: "completed", position: 3 },
	{ id: "s-backlog", name: "Backlog", category: "backlog", position: 0 },
	{ id: "s-todo-b", name: "Todo B", category: "unstarted", position: 2 },
	{ id: "s-todo-a", name: "Todo A", category: "unstarted", position: 1 },
	{ id: "s-canceled", name: "Canceled", category: "canceled", position: 4 },
] as never;

const issue = {
	id: "i1",
	projectId: "p1",
	projectKey: "WEB",
	number: 7,
	identifier: "WEB-7",
	title: "Triage me",
	statusId: "s-backlog",
	statusName: "Backlog",
	statusCategory: "backlog",
	statusColor: "#000",
	priority: 0,
	createdById: "user-1",
	createdAt: "2026-06-01T00:00:00.000Z",
} satisfies TriageIssueDto;

const withRequests = async <T>(
	respond: () => Response,
	run: (requests: { url: URL; method: string; body: unknown }[]) => Promise<T>,
) => {
	const original = globalThis.fetch;
	const requests: { url: URL; method: string; body: unknown }[] = [];
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(
				input instanceof Request ? input.url : String(input),
				"http://localhost",
			);
			requests.push({
				url,
				method: init?.method ?? "GET",
				body:
					typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
			});
			return respond();
		},
		{ preconnect: original.preconnect },
	) as typeof fetch;
	try {
		return await run(requests);
	} finally {
		globalThis.fetch = original;
	}
};

test("accept assigns the current user and the first unstarted status", () => {
	assert.deepEqual(
		triageActionInput("accept", { assigneeId: "user-9", statuses }),
		{ assigneeId: "user-9", statusId: "s-todo-a" },
	);
});

test("decline only moves the issue to the first canceled status", () => {
	assert.deepEqual(
		triageActionInput("decline", { assigneeId: "user-9", statuses }),
		{ statusId: "s-canceled" },
	);
});

test("missing target status yields no variables", () => {
	assert.equal(
		triageActionInput("accept", {
			assigneeId: "user-9",
			statuses: statuses.filter(
				(status: { category: string }) => status.category !== "unstarted",
			),
		}),
		null,
	);
	assert.equal(firstStatusOfCategory(undefined, "unstarted"), undefined);
});

test("triage PATCH carries the built update to the issue endpoint", () =>
	withRequests(
		() => Response.json({ ok: true, data: {} }),
		async (requests) => {
			const input = triageActionInput("accept", {
				assigneeId: "user-9",
				statuses,
			});
			assert.ok(input);
			await triageAction("org", { issue, input, action: "accept" });
			assert.equal(
				requests[0].url.pathname,
				"/api/orgs/org/projects/p1/issues/7",
			);
			assert.equal(requests[0].method, "PATCH");
			assert.deepEqual(requests[0].body, {
				assigneeId: "user-9",
				statusId: "s-todo-a",
			});
		},
	));

test("bulk triage keeps successful rows and reports partial failure", async () => {
	const updates: TriageUpdate[] = [
		{ issue, input: { statusId: "s-todo-a" }, action: "accept" },
		{
			issue: { ...issue, id: "i2", number: 8 },
			input: { statusId: "s-todo-a" },
			action: "accept",
		},
	];
	const calls: string[] = [];
	await assert.rejects(
		runBulkTriage(updates, async (update) => {
			calls.push(update.issue.id);
			if (update.issue.id === "i2") {
				throw new Error("nope");
			}
		}),
		(error: unknown) => {
			assert.equal(errorCode(error), BULK_PARTIAL_FAILURE);
			assert.deepEqual(bulkPartialFailure(error), { failed: 1, total: 2 });
			return true;
		},
	);
	assert.deepEqual(calls, ["i1", "i2"]);

	await runBulkTriage(updates.slice(0, 1), async () => undefined);
});

test("frozen and pending states map to disabled triage controls", () => {
	assert.deepEqual(
		triageAvailability({ frozen: false, assigneeId: "user-1" }),
		{ select: true, accept: true, decline: true },
	);
	// Frozen organizations are read-only: even selection is blocked.
	assert.deepEqual(triageAvailability({ frozen: true, assigneeId: "user-1" }), {
		select: false,
		accept: false,
		decline: false,
	});
	// A pending write blocks actions but keeps the selection usable.
	assert.deepEqual(
		triageAvailability({ frozen: false, busy: true, assigneeId: "user-1" }),
		{ select: true, accept: false, decline: false },
	);
	// Accept needs a signed-in assignee; decline does not.
	assert.deepEqual(
		triageAvailability({ frozen: false, assigneeId: undefined }),
		{ select: true, accept: false, decline: true },
	);
});

test("URL project filter falls back when the project is gone", () => {
	const projects = [{ id: "p1" }, { id: "p2" }];
	assert.equal(resolveTriageProjectFilter({ projectId: "p2" }, projects), "p2");
	assert.equal(
		resolveTriageProjectFilter({ projectId: "deleted" }, projects),
		undefined,
	);
	assert.equal(resolveTriageProjectFilter({}, projects), undefined);
	assert.deepEqual(triageSearchSchema.parse({}), {});
	assert.deepEqual(triageSearchSchema.parse({ projectId: "p1" }), {
		projectId: "p1",
	});
});

test("triage cache key separates the project filter", () => {
	assert.deepEqual(triageKey("org"), ["orgs", "org", "triage", "all"]);
	assert.deepEqual(triageKey("org", "p1"), ["orgs", "org", "triage", "p1"]);
	// Issue writes invalidate the same root, so both modules must agree on it.
	assert.deepEqual(triageRootKey("org"), ["orgs", "org", "triage"]);
	assert.deepEqual(triageKey("org", "p1").slice(0, 3), triageRootKey("org"));
});
