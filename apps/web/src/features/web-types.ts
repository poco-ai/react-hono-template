import type { useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { TranslationKey } from "@/lib/errors";

/**
 * Shared contracts for web feature contributions (template refactor Phase 5).
 *
 * The shell (`components/`, `routes/`, `pages/`) renders from these
 * declarations; features own the data behind them. Only types live here so
 * the shell and the feature modules can share the contract without a runtime
 * cycle through `features/registry.ts`.
 */

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

/**
 * Everything the action list needs to decide visibility and navigate.
 * `navigate` is the router's `useNavigate()` result so targets stay type-checked.
 */
export type PaletteActionContext = {
	orgId: string;
	/** Set only on routes that carry a project (`/projects/:projectId[/:issueNumber]`). */
	currentProjectId?: string;
	navigate: ReturnType<typeof useNavigate>;
	setPanelOpen: (open: boolean) => void;
	canManage: boolean;
	isAdmin: boolean;
};

/** One row of the palette "Actions" group; `run` only navigates or calls back. */
export type PaletteAction = {
	id: string;
	labelKey: TranslationKey;
	icon: LucideIcon;
	keywords?: string[];
	shortcut?: string;
	when?: (ctx: PaletteActionContext) => boolean;
	run: (ctx: PaletteActionContext) => void | Promise<void>;
};

/** Settings pages reachable from the org settings layout. */
export type SettingsNavTo =
	| "/orgs/$orgId/settings"
	| "/orgs/$orgId/settings/members"
	| "/orgs/$orgId/settings/labels"
	| "/orgs/$orgId/settings/statuses"
	| "/orgs/$orgId/settings/templates"
	| "/orgs/$orgId/settings/ai"
	| "/orgs/$orgId/settings/api-keys"
	| "/orgs/$orgId/settings/mcp"
	| "/orgs/$orgId/settings/webhooks"
	| "/orgs/$orgId/settings/audit"
	| "/orgs/$orgId/settings/billing";

export type SettingsNavItem = {
	id: string;
	to: SettingsNavTo;
	labelKey: TranslationKey;
	/** Only owners/admins see this entry (`canManage` gate). */
	requiresManage?: boolean;
	/** Match only the index route instead of its children. */
	exact?: boolean;
};

/** Bottom navigation destinations (`md:hidden`). */
export type MobileTabTo =
	| "/orgs/$orgId/inbox"
	| "/orgs/$orgId/my-issues"
	| "/orgs/$orgId/projects"
	| "/orgs/$orgId/ai";

export type MobileTabItem = {
	id: string;
	to: MobileTabTo;
	labelKey: TranslationKey;
	icon: LucideIcon;
	/** Trailing unread badge fed by the navigation context. */
	badge?: "unread";
	/** Match only the route itself instead of its children. */
	exact?: boolean;
	/** Route search params required to open the tab (e.g. inbox filter). */
	search?: Record<string, string>;
};

/**
 * A global provider contributed by a feature and mounted by `OrgLayout`.
 * The factory receives the current org id so the provider remounts per org.
 */
export type WebProvider = (
	orgId: string,
) => ComponentType<{ children: ReactNode }>;

/**
 * Context the shell passes to an org sidebar section contributed by a feature.
 * `currentProjectId` is set only when a project route is active.
 */
export type OrgSidebarSectionContext = {
	orgId: string;
	/** Desktop rail is collapsed (the mobile Sheet always renders fully). */
	collapsed: boolean;
	currentProjectId?: string;
	onNavigate: () => void;
};

/** Extra sidebar content contributed by a feature (rendered above the nav). */
export type WebSidebarSection = ComponentType<OrgSidebarSectionContext>;

/** Extra rows rendered inside one project's sidebar entry (e.g. AI chats). */
export type WebProjectExtras = ComponentType<{
	orgId: string;
	projectId: string;
	onNavigate: () => void;
}>;

/** A fullscreen panel mounted once by the org layout (e.g. the AI chat panel). */
export type WebPanel = ComponentType;

/**
 * What a feature contributes to the web shell. `features/<id>/web.ts` exports
 * one of these; `features/registry.ts` aggregates them. Scaffold (Phase 6)
 * rewrites the registry per preset, so trimming a feature also removes every
 * contribution declared here.
 */
export type WebFeatureDecl = {
	id: string;
	/** Workspace sidebar entries, merged into `ORG_SIDEBAR_NAV`. */
	nav?: () => OrgSidebarNavItem[];
	/** Extra sidebar content (rendered above the workspace nav). */
	sidebarSections?: readonly WebSidebarSection[];
	/** Extra rows under each project in the sidebar (project-scoped chats). */
	projectExtras?: readonly WebProjectExtras[];
	/** Command palette actions, merged into `PALETTE_ACTIONS`. */
	paletteActions?: () => PaletteAction[];
	/** Org settings navigation entries rendered by the settings layout. */
	settingsNav?: () => SettingsNavItem[];
	/** Global providers wrapped around the org layout (e.g. the AI chat). */
	providers?: WebProvider[];
	/** Bottom navigation entries, merged into `MobileTabBar`. */
	mobileTabs?: () => MobileTabItem[];
	/** Fullscreen panels mounted at the end of the org layout. */
	panels?: readonly WebPanel[];
	/** Locale namespaces this feature owns (`i18n/locales/<lang>/<ns>.ts`). */
	i18nNamespaces?: string[];
};
