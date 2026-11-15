import type { LucideIcon } from "lucide-react";
import {
	Activity,
	Bell,
	Filter,
	FolderKanban,
	Inbox,
	Map as MapIcon,
	Star,
} from "lucide-react";

/** Org-scoped routes rendered by the workspace navigation. */
export type OrgSidebarNavTo =
	| "/orgs/$orgId/inbox"
	| "/orgs/$orgId/my-issues"
	| "/orgs/$orgId/favorites"
	| "/orgs/$orgId/roadmap"
	| "/orgs/$orgId/triage"
	| "/orgs/$orgId/activity"
	| "/orgs/$orgId/projects";

/** Translation keys used by the workspace navigation labels. */
export type OrgSidebarNavLabelKey =
	| "nav.inbox"
	| "nav.myIssues"
	| "nav.favorites"
	| "nav.roadmap"
	| "nav.triage"
	| "nav.activity"
	| "nav.projects";

export type OrgSidebarNavContext = {
	/** Desktop rail is collapsed (the mobile Sheet always renders fully). */
	collapsed: boolean;
	unreadCount: number;
};

export type OrgSidebarNavItem = {
	id: string;
	to: OrgSidebarNavTo;
	/** Extra route params; the org id is always supplied by the renderer. */
	params?: (orgId: string) => { orgId: string };
	labelKey: OrgSidebarNavLabelKey;
	icon: LucideIcon;
	/** Match only the route itself instead of its children. */
	exact?: boolean;
	/** Trailing badge fed by the navigation context. */
	badge?: "unread";
	/** Hide the entry entirely when this returns false. */
	when?: (context: OrgSidebarNavContext) => boolean;
};

export const ORG_SIDEBAR_NAV: OrgSidebarNavItem[] = [
	{
		id: "inbox",
		to: "/orgs/$orgId/inbox",
		exact: true,
		labelKey: "nav.inbox",
		icon: Bell,
		badge: "unread",
	},
	{
		id: "my-issues",
		to: "/orgs/$orgId/my-issues",
		exact: true,
		labelKey: "nav.myIssues",
		icon: Inbox,
	},
	{
		id: "favorites",
		to: "/orgs/$orgId/favorites",
		exact: true,
		labelKey: "nav.favorites",
		icon: Star,
	},
	{
		id: "roadmap",
		to: "/orgs/$orgId/roadmap",
		exact: true,
		labelKey: "nav.roadmap",
		icon: MapIcon,
	},
	{
		id: "triage",
		to: "/orgs/$orgId/triage",
		exact: true,
		labelKey: "nav.triage",
		icon: Filter,
	},
	{
		id: "activity",
		to: "/orgs/$orgId/activity",
		exact: true,
		labelKey: "nav.activity",
		icon: Activity,
	},
	{
		id: "projects",
		to: "/orgs/$orgId/projects",
		labelKey: "nav.projects",
		icon: FolderKanban,
		when: ({ collapsed }) => collapsed,
	},
];
