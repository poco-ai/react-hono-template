import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiErrorCode } from "@workspace/shared";
import {
	type CapabilityContext,
	type CapabilityDeps,
	createCapabilityLayer,
} from "../src/features/capabilities/index";

/** The `search_all` capability is part of the capabilities slice (ai/mcp). */
test("search_all capability calls the shared search service", async () => {
	const calls: { orgId: string; input: unknown }[] = [];
	const issueHit = {
		id: "issue-1",
		projectId: "project-1",
		projectKey: "WEB",
		number: 1,
		identifier: "WEB-1",
		title: "Login fails",
		descriptionExcerpt: null,
		statusId: "status-1",
		statusName: "Todo",
		statusColor: "#3b82f6",
		statusCategory: "unstarted",
		priority: 2,
		assignee: null,
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
	const deps = {
		services: {
			searchService: {
				searchAll: async (orgId: string, input: unknown) => {
					calls.push({ orgId, input });
					return {
						issues: [issueHit],
						comments: [],
						projects: [],
						members: [],
					};
				},
			},
		},
		daos: {
			memberDao: {
				findByOrgAndUser: async () => ({ role: "owner", frozen: false }),
			},
		},
	} as unknown as CapabilityDeps;
	const layer = createCapabilityLayer(deps);
	const entry = layer.get("search_all");
	assert.equal(entry?.effect, "read");
	assert.deepEqual(entry?.scopes, ["read"]);

	const result = await layer.execute(
		"search_all",
		{
			orgId: "org",
			actor: {
				userId: "user-1",
				surface: "chat",
				scopes: ["read"],
				role: "owner",
			},
			canWrite: false,
			locale: "en",
			webBaseUrl: "https://app.example.com",
			background: (task) => {
				void task().catch(() => undefined);
			},
		} satisfies CapabilityContext,
		{ q: "login" },
	);

	assert.deepEqual(calls, [{ orgId: "org", input: { q: "login", limit: 8 } }]);
	assert.match(result.summary, /Found 1 issue\(s\).*matching "login"/);
	assert.deepEqual(result.data, {
		issues: [issueHit],
		comments: [],
		projects: [],
		members: [],
	});
	assert.ok(
		result.links.some((link) => link.url.endsWith("/projects/project-1/1")),
	);

	await assert.rejects(
		layer.execute(
			"search_all",
			{
				orgId: "org",
				actor: { userId: "user-1", surface: "chat", scopes: ["read"] },
				canWrite: false,
				locale: "en",
				webBaseUrl: "https://app.example.com",
				background: () => undefined,
			},
			{ q: "" },
		),
		(err) =>
			err instanceof Error &&
			"code" in err &&
			err.code === ApiErrorCode.VALIDATION,
	);
});
