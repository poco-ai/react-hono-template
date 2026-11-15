import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildPaletteActions,
	PALETTE_ACTIONS,
	type PaletteActionContext,
} from "../src/components/command-palette/actions";

type NavigateCall = {
	to: string;
	params?: Record<string, string>;
	search?: Record<string, unknown>;
};

function createContext(
	overrides: Partial<PaletteActionContext> = {},
): PaletteActionContext & { calls: NavigateCall[]; panel: boolean[] } {
	const calls: NavigateCall[] = [];
	const panel: boolean[] = [];
	return {
		orgId: "org_1",
		navigate: ((options: NavigateCall) => {
			calls.push(options);
			return Promise.resolve();
		}) as unknown as PaletteActionContext["navigate"],
		setPanelOpen: (open: boolean) => {
			panel.push(open);
		},
		canManage: false,
		isAdmin: false,
		calls,
		panel,
		...overrides,
	};
}

const ids = (ctx: PaletteActionContext) =>
	buildPaletteActions(ctx).map((action) => action.id);

test("palette actions keep their ids, labels and order", () => {
	assert.deepEqual(
		PALETTE_ACTIONS.map((action) => [action.id, action.labelKey]),
		[
			["ask-ai", "command.askAi"],
			["new-issue", "command.newIssue"],
			["new-project", "command.newProject"],
			["inbox", "command.goToInbox"],
			["my-issues", "command.goToMyIssues"],
			["activity", "command.goToActivity"],
			["settings-general", "command.settingsGeneral"],
			["settings-members", "command.settingsMembers"],
			["settings-labels", "command.settingsLabels"],
			["settings-api-keys", "command.settingsApiKeys"],
			["settings-webhooks", "command.settingsWebhooks"],
			["settings-billing", "command.settingsBilling"],
			["api-docs", "command.goToApiDocs"],
			["admin", "command.goToAdmin"],
		],
	);
});

test("visibility follows the route project, manage role and admin role", () => {
	assert.deepEqual(ids(createContext()), [
		"ask-ai",
		"new-project",
		"inbox",
		"my-issues",
		"activity",
		"settings-general",
		"settings-members",
		"settings-labels",
		"api-docs",
	]);
	assert.deepEqual(
		ids(createContext({ currentProjectId: "project_1" })).slice(0, 3),
		["ask-ai", "new-issue", "new-project"],
	);
	assert.deepEqual(
		ids(createContext({ canManage: true })).filter((id) =>
			id.startsWith("settings-"),
		),
		[
			"settings-general",
			"settings-members",
			"settings-labels",
			"settings-api-keys",
			"settings-webhooks",
			"settings-billing",
		],
	);
	assert.deepEqual(ids(createContext({ isAdmin: true })).at(-1), "admin");
});

test("actions only navigate or open the AI panel", async () => {
	const ctx = createContext({
		currentProjectId: "project_1",
		canManage: true,
		isAdmin: true,
	});
	for (const action of buildPaletteActions(ctx)) {
		await action.run(ctx);
	}
	assert.deepEqual(ctx.panel, [true]);
	assert.deepEqual(ctx.calls, [
		{
			to: "/orgs/$orgId/projects/$projectId",
			params: { orgId: "org_1", projectId: "project_1" },
			search: { page: 1, sort: "updated", new: true },
		},
		{ to: "/orgs/$orgId/projects", params: { orgId: "org_1" } },
		{
			to: "/orgs/$orgId/inbox",
			params: { orgId: "org_1" },
			search: { filter: "all" },
		},
		{ to: "/orgs/$orgId/my-issues", params: { orgId: "org_1" } },
		{ to: "/orgs/$orgId/activity", params: { orgId: "org_1" } },
		{ to: "/orgs/$orgId/settings", params: { orgId: "org_1" } },
		{ to: "/orgs/$orgId/settings/members", params: { orgId: "org_1" } },
		{ to: "/orgs/$orgId/settings/labels", params: { orgId: "org_1" } },
		{ to: "/orgs/$orgId/settings/api-keys", params: { orgId: "org_1" } },
		{ to: "/orgs/$orgId/settings/webhooks", params: { orgId: "org_1" } },
		{ to: "/orgs/$orgId/settings/billing", params: { orgId: "org_1" } },
		{ to: "/api-docs" },
		{ to: "/admin" },
	]);
});

test("new issue stays inert when the route carries no project", async () => {
	const ctx = createContext();
	const newIssue = PALETTE_ACTIONS.find((action) => action.id === "new-issue");
	assert.ok(newIssue);
	await newIssue.run(ctx);
	assert.deepEqual(ctx.calls, []);
	assert.deepEqual(ctx.panel, []);
});
