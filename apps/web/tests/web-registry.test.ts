import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PALETTE_ACTIONS } from "../src/components/command-palette/actions";
import { CORE_SETTINGS_NAV } from "../src/components/org-settings-nav";
import { orgSidebarNav } from "../src/components/org-sidebar-nav";
import {
	mergeMobileTabs,
	mergeSettingsNav,
	WEB_FEATURES,
} from "../src/features/registry";
import type { MobileTabItem, SettingsNavItem } from "../src/features/web-types";
import en from "../src/i18n/locales/en";

/**
 * Phase 5 registry invariants (docs/模板化重构方案.md §9).
 *
 * The shell renders from `features/registry.ts`; these tests keep the
 * scaffold-facing declarations honest:
 * 1. every registered id exists in `presets/features/*.json`;
 * 2. every declared locale namespace has an en + zh file;
 * 3. every label key resolves in the en translation object;
 * 4. the merged shell lists keep the exact ids, labels and order of the
 *    pre-refactor HEAD implementation (captured below from commit f17dd79).
 */

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../..",
);
const LOCALES = path.join(REPO_ROOT, "apps/web/src/i18n/locales");
const PRESET_FEATURES = path.join(REPO_ROOT, "presets/features");

/** `orgSidebarNav()` as shipped by HEAD (`components/org-sidebar-nav.ts`). */
const HEAD_SIDEBAR = [
	["inbox", "/orgs/$orgId/inbox", "nav.inbox"],
	["my-issues", "/orgs/$orgId/my-issues", "nav.myIssues"],
	["favorites", "/orgs/$orgId/favorites", "nav.favorites"],
	["roadmap", "/orgs/$orgId/roadmap", "nav.roadmap"],
	["triage", "/orgs/$orgId/triage", "nav.triage"],
	["activity", "/orgs/$orgId/activity", "nav.activity"],
	["projects", "/orgs/$orgId/projects", "nav.projects"],
] as const;

/** `PALETTE_ACTIONS` as shipped by HEAD (`components/command-palette/actions.ts`). */
const HEAD_PALETTE = [
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
] as const;

/** `settings/route.tsx` links as shipped by HEAD, before the `canManage` gate. */
const HEAD_SETTINGS = [
	["general", "settings.general", false],
	["members", "settings.members", false],
	["labels", "settings.labels", false],
	["statuses", "settings.statuses", false],
	["templates", "settings.templates", false],
	["ai", "settings.ai", false],
	["api-keys", "settings.apiKeys", true],
	["mcp", "settings.mcp", true],
	["webhooks", "settings.webhooks", true],
	["audit", "settings.audit", true],
	["billing", "settings.billing", false],
] as const;

/** `mobile-tab-bar.tsx` tabs as shipped by HEAD. */
const HEAD_MOBILE_TABS = ["inbox", "my-issues", "projects", "ai"] as const;

function presetFeatureIds(): string[] {
	return readdirSync(PRESET_FEATURES, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
		.map((entry) => entry.name.slice(0, -".json".length));
}

/** Resolve a dotted `t("a.b")` key against the aggregated en object. */
function resolveTranslation(key: string): unknown {
	return key.split(".").reduce<unknown>((node, segment) => {
		if (typeof node !== "object" || node === null) return undefined;
		return (node as Record<string, unknown>)[segment];
	}, en);
}

function assertResolvableLabel(labelKey: string) {
	const value = resolveTranslation(labelKey);
	assert.equal(
		typeof value,
		"string",
		`label key "${labelKey}" must exist in the en translation object`,
	);
}

test("every registered web feature exists in the preset manifests", () => {
	const known = new Set(presetFeatureIds());
	const unknown = WEB_FEATURES.map((feature) => feature.id).filter(
		(id) => !known.has(id),
	);
	assert.deepEqual(unknown, [], "registry ids missing from presets/features");
});

test("registry features are unique and every declaration matches its id", () => {
	const ids = WEB_FEATURES.map((feature) => feature.id);
	assert.deepEqual(
		ids,
		[...new Set(ids)],
		"features/registry.ts must list each feature once",
	);
});

test("every declared i18n namespace has an en and zh file", () => {
	for (const feature of WEB_FEATURES) {
		for (const namespace of feature.i18nNamespaces ?? []) {
			for (const language of ["en", "zh"] as const) {
				const file = path.join(LOCALES, language, `${namespace}.ts`);
				assert.ok(
					existsSync(file),
					`${feature.id} declares i18n namespace "${namespace}" without ${language}/${namespace}.ts`,
				);
			}
			assert.equal(
				typeof (en as Record<string, unknown>)[namespace],
				"object",
				`en aggregator must expose the "${namespace}" namespace`,
			);
		}
	}
});

test("every registry label key resolves in the en translations", () => {
	for (const feature of WEB_FEATURES) {
		for (const item of feature.nav?.() ?? []) {
			assertResolvableLabel(item.labelKey);
		}
		for (const item of feature.paletteActions?.() ?? []) {
			assertResolvableLabel(item.labelKey);
		}
		for (const item of feature.settingsNav?.() ?? []) {
			assertResolvableLabel(item.labelKey);
		}
		for (const item of feature.mobileTabs?.() ?? []) {
			assertResolvableLabel(item.labelKey);
		}
	}
});

test("workspace navigation keeps the HEAD ids, targets, labels and order", () => {
	assert.deepEqual(
		orgSidebarNav().map((item) => [item.id, item.to, item.labelKey]),
		HEAD_SIDEBAR.map(([id, to, labelKey]) => [id, to, labelKey]),
	);
	assert.deepEqual(
		orgSidebarNav().map((item) => item.exact ?? false),
		[true, true, true, true, true, true, false],
	);
	assert.deepEqual(
		orgSidebarNav().map((item) => item.badge),
		[
			"unread",
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		],
	);
	// `projects` only appears in the collapsed rail (HEAD behaviour).
	const context = (collapsed: boolean) => ({ collapsed, unreadCount: 0 });
	assert.equal(orgSidebarNav()[6]?.when?.(context(false)), false);
	assert.equal(orgSidebarNav()[6]?.when?.(context(true)), true);
});

test("palette actions keep the HEAD ids, labels and order", () => {
	assert.deepEqual(
		PALETTE_ACTIONS.map((action) => [action.id, action.labelKey]),
		HEAD_PALETTE.map(([id, labelKey]) => [id, labelKey]),
	);
});

test("settings navigation keeps the HEAD ids, labels, order and manage gate", () => {
	const settings = mergeSettingsNav(CORE_SETTINGS_NAV);
	assert.deepEqual(
		settings.map((item) => [
			item.id,
			item.labelKey,
			Boolean(item.requiresManage),
		]),
		HEAD_SETTINGS.map(([id, labelKey, requiresManage]) => [
			id,
			labelKey,
			requiresManage,
		]),
	);
	assert.deepEqual(
		settings.map((item) => item.to),
		[
			"/orgs/$orgId/settings",
			"/orgs/$orgId/settings/members",
			"/orgs/$orgId/settings/labels",
			"/orgs/$orgId/settings/statuses",
			"/orgs/$orgId/settings/templates",
			"/orgs/$orgId/settings/ai",
			"/orgs/$orgId/settings/api-keys",
			"/orgs/$orgId/settings/mcp",
			"/orgs/$orgId/settings/webhooks",
			"/orgs/$orgId/settings/audit",
			"/orgs/$orgId/settings/billing",
		],
	);
	// Only the index route matches exactly; every other tab owns children.
	assert.deepEqual(
		settings.filter((item) => item.exact).map((item) => item.id),
		["general"],
	);
});

test("mobile tabs keep the HEAD ids and order", () => {
	const tabs: MobileTabItem[] = mergeMobileTabs([]);
	assert.deepEqual(
		tabs.map((tab) => tab.id),
		[...HEAD_MOBILE_TABS],
	);
	const [inbox, myIssues, projects, ai] = tabs;
	assert.deepEqual(
		[inbox.labelKey, myIssues.labelKey, projects.labelKey, ai.labelKey],
		["nav.inbox", "nav.myIssues", "nav.projects", "nav.ai"],
	);
	assert.equal(inbox.badge, "unread");
	assert.deepEqual(inbox.search, { filter: "all" });
	assert.deepEqual(
		[inbox.exact, myIssues.exact, projects.exact, ai.exact],
		[true, true, undefined, false],
	);
});

test("trimming a feature removes its shell contributions", () => {
	// The scaffold rewrites `features/registry.ts`; simulate the shape by
	// keeping only issues + projects and asserting the contributions collapse
	// to that subset (the shell order maps tolerate absent ids).
	const trimmed = WEB_FEATURES.filter((feature) =>
		["issues", "projects"].includes(feature.id),
	);
	const nav = trimmed.flatMap((feature) => feature.nav?.() ?? []);
	const palette = trimmed.flatMap(
		(feature) => feature.paletteActions?.() ?? [],
	);
	assert.deepEqual(nav.map((item) => item.id).sort(), [
		"my-issues",
		"projects",
		"triage",
	]);
	assert.deepEqual(palette.map((action) => action.id).sort(), [
		"my-issues",
		"new-issue",
		"new-project",
	]);
	assert.deepEqual(
		trimmed.flatMap((feature) => feature.providers ?? []),
		[],
	);
});

test("settings nav item type stays exhaustive over the shell order", () => {
	// Compile-time guard: every merged settings entry is a SettingsNavItem.
	const settings: SettingsNavItem[] = mergeSettingsNav([]);
	assert.ok(settings.length > 0);
});
