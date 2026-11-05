import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { projectUpdatesKey } from "../src/features/keys";
import {
	createProjectUpdate,
	deleteProjectUpdate,
	invalidateProjectUpdateQueries,
	updateProjectUpdate,
} from "../src/features/project-updates/data";
import { updateProject } from "../src/features/projects/data";
import {
	PROJECT_HEALTH_META,
	projectHealthOf,
	projectTargetDateStatus,
} from "../src/features/projects/utils";

interface RequestRecord {
	url: URL;
	method: string;
	body: unknown;
}

async function withRequests(run: (requests: RequestRecord[]) => Promise<void>) {
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
			return Response.json({ ok: true, data: {} });
		},
		{ preconnect: original.preconnect },
	) as typeof fetch;
	try {
		await run(requests);
	} finally {
		globalThis.fetch = original;
	}
}

test("project edits carry target date, lead and health with nullable semantics", () =>
	withRequests(async (requests) => {
		await updateProject("org", {
			projectId: "project",
			input: {
				targetDate: "2026-12-01T00:00:00.000Z",
				leadId: "user-1",
				health: "at_risk",
			},
		});
		await updateProject("org", {
			projectId: "project",
			input: { targetDate: null, leadId: null, health: null },
		});
		assert.equal(requests[0].url.pathname, "/api/orgs/org/projects/project");
		assert.equal(requests[0].method, "PATCH");
		assert.deepEqual(requests[0].body, {
			targetDate: "2026-12-01T00:00:00.000Z",
			leadId: "user-1",
			health: "at_risk",
		});
		assert.deepEqual(requests[1].body, {
			targetDate: null,
			leadId: null,
			health: null,
		});
	}));

test("project update requests target the project timeline", () =>
	withRequests(async (requests) => {
		await createProjectUpdate("org", "project", {
			body: "Shipping this week",
			health: "on_track",
		});
		await updateProjectUpdate("org", "project", {
			updateId: "update-1",
			input: { body: "Slipped a day", health: null },
		});
		await deleteProjectUpdate("org", "project", "update-1");
		assert.equal(
			requests[0].url.pathname,
			"/api/orgs/org/projects/project/updates",
		);
		assert.equal(requests[0].method, "POST");
		assert.deepEqual(requests[0].body, {
			body: "Shipping this week",
			health: "on_track",
		});
		assert.equal(
			requests[1].url.pathname,
			"/api/orgs/org/projects/project/updates/update-1",
		);
		assert.equal(requests[1].method, "PATCH");
		assert.deepEqual(requests[1].body, { body: "Slipped a day", health: null });
		assert.equal(requests[2].method, "DELETE");
		assert.equal(
			requests[2].url.pathname,
			"/api/orgs/org/projects/project/updates/update-1",
		);
	}));

test("update timeline keys nest under the project updates root", () => {
	assert.deepEqual(
		[...projectUpdatesKey("org", "project")],
		["orgs", "org", "projects", "project", "updates"],
	);
});

test("update writes refresh the timeline and project caches only in their org", async () => {
	const client = new QueryClient();
	const affected = [
		["orgs", "org", "projects", "project", "updates"],
		["orgs", "org", "projects"],
		["orgs", "org", "projects", "project"],
		["orgs", "org", "projects", "project", "issues", { page: 1 }],
		["orgs", "org", "projects", "other", "updates"],
	];
	const unaffected = [
		["orgs", "other", "projects"],
		["orgs", "other", "projects", "project", "updates"],
		["orgs", "org", "members"],
	];
	try {
		for (const key of [...affected, ...unaffected]) {
			client.setQueryData(key, {});
		}
		await invalidateProjectUpdateQueries(client, "org", "project");
		// The projects root prefix also refreshes sibling project caches, which is
		// the same tradeoff as the existing project write invalidation.
		for (const key of [
			["orgs", "org", "projects", "project", "updates"],
			["orgs", "org", "projects"],
			["orgs", "org", "projects", "project"],
			["orgs", "org", "projects", "project", "issues", { page: 1 }],
			["orgs", "org", "projects", "other", "updates"],
		]) {
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
});

test("health values map to distinct labels and colors", () => {
	assert.equal(projectHealthOf("on_track"), "on_track");
	assert.equal(projectHealthOf("at_risk"), "at_risk");
	assert.equal(projectHealthOf("off_track"), "off_track");
	assert.equal(projectHealthOf(null), null);
	assert.equal(projectHealthOf("unknown"), null);

	const classes = new Set([
		PROJECT_HEALTH_META.on_track.className,
		PROJECT_HEALTH_META.at_risk.className,
		PROJECT_HEALTH_META.off_track.className,
	]);
	assert.equal(classes.size, 3);
	assert.match(PROJECT_HEALTH_META.on_track.className, /emerald/);
	assert.match(PROJECT_HEALTH_META.at_risk.className, /amber/);
	assert.match(PROJECT_HEALTH_META.off_track.className, /red/);
});

test("target date status flags overdue and near-term dates", () => {
	const now = new Date(2026, 10, 10);
	assert.equal(projectTargetDateStatus(null, now), null);
	assert.equal(
		projectTargetDateStatus("2026-11-09T00:00:00.000Z", now),
		"overdue",
	);
	assert.equal(
		projectTargetDateStatus("2026-11-10T00:00:00.000Z", now),
		"soon",
	);
	assert.equal(
		projectTargetDateStatus("2026-11-17T00:00:00.000Z", now),
		"soon",
	);
	assert.equal(
		projectTargetDateStatus("2026-11-18T00:00:00.000Z", now),
		"upcoming",
	);
});
