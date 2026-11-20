import assert from "node:assert/strict";
import { test } from "node:test";
// Include the same module augmentations as the application without booting it.
import type {} from "../src/lib/auth/auth-plugin";
import type {} from "../src/router";
import { Route as IssueDetailRoute } from "../src/routes/_auth/orgs/$orgId/projects/$projectId/$issueNumber";
import { Route as ProjectCyclesRoute } from "../src/routes/_auth/orgs/$orgId/projects/$projectId/cycles";
import { Route as ProjectIssuesRoute } from "../src/routes/_auth/orgs/$orgId/projects/$projectId.index";

test("project route state is reset for a different project, not a search change", () => {
	const remount = ProjectIssuesRoute.options.remountDeps;
	assert.ok(remount);
	const deps = (orgId: string, projectId: string, page: number) =>
		remount({
			routeId: ProjectIssuesRoute.id,
			params: { orgId, projectId },
			search: { page, sort: "updated" },
			loaderDeps: {},
		});
	assert.deepEqual(deps("org", "project", 1), deps("org", "project", 2));
	assert.notDeepEqual(deps("org", "project", 1), deps("org", "other", 1));
	assert.notDeepEqual(deps("org", "project", 1), deps("other", "project", 1));
});

test("cycle route state is reset for a different project", () => {
	const remount = ProjectCyclesRoute.options.remountDeps;
	assert.ok(remount);
	const deps = (projectId: string) =>
		remount({
			routeId: ProjectCyclesRoute.id,
			params: { orgId: "org", projectId },
			search: {},
			loaderDeps: {},
		});
	assert.notDeepEqual(deps("project"), deps("other"));
});

test("issue route state is reset when opening a different issue", () => {
	const remount = IssueDetailRoute.options.remountDeps;
	assert.ok(remount);
	const deps = (issueNumber: string) =>
		remount({
			routeId: IssueDetailRoute.id,
			params: { orgId: "org", projectId: "project", issueNumber },
			search: {},
			loaderDeps: {},
		});
	assert.notDeepEqual(deps("1"), deps("2"));
});
