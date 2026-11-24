import type { SettingsNavItem } from "@/features/web-types";

/**
 * Core settings pages (general, people, workflow, templates, audit). The
 * feature-owned pages arrive from `features/registry.ts` and are merged by
 * `mergeSettingsNav` in the settings layout.
 */
export const CORE_SETTINGS_NAV: readonly SettingsNavItem[] = [
	{
		id: "general",
		to: "/orgs/$orgId/settings",
		labelKey: "settings.general",
		exact: true,
	},
	{
		id: "members",
		to: "/orgs/$orgId/settings/members",
		labelKey: "settings.members",
	},
	{
		id: "labels",
		to: "/orgs/$orgId/settings/labels",
		labelKey: "settings.labels",
	},
	{
		id: "statuses",
		to: "/orgs/$orgId/settings/statuses",
		labelKey: "settings.statuses",
	},
	{
		id: "templates",
		to: "/orgs/$orgId/settings/templates",
		labelKey: "settings.templates",
	},
	{
		id: "audit",
		to: "/orgs/$orgId/settings/audit",
		labelKey: "settings.audit",
		requiresManage: true,
	},
];
