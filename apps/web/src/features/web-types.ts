import type { useNavigate } from "@tanstack/react-router";
import type {
	IssueFilterGroup,
	IssuePriorityName,
	IssueQuery,
} from "@workspace/shared";
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
 * Hook-owned palette controller: lets the command palette open a feature panel
 * (the AI chat) without importing the feature module. `useOpen` must follow
 * the rules of hooks; the registry returns a noop when no feature contributes.
 */
export type WebPalettePanel = {
	useOpen: () => () => void;
};

// ---------------------------------------------------------------------------
// Page contribution contracts (issue/project pages rendered by core features)
//
// The issue and project pages are owned by the `issues`/`projects` slices, but
// optional features hang extra UI off them (cycle banner, saved views, star
// buttons, comments/attachments sections...). These structural contexts keep
// those pages compiling when the contributing slice is trimmed: a disabled
// feature simply contributes nothing.
// ---------------------------------------------------------------------------

/** One ordered contribution slot; the shell renders by `order`, then registry order. */
export type WebOrderedComponent<Context> = {
	id: string;
	order: number;
	component: ComponentType<Context>;
};

/** Project title/actions context (project page + mobile overflow menu). */
export type ProjectPageContext = {
	orgId: string;
	projectId: string;
	frozen: boolean;
	canManage: boolean;
	project?: {
		id: string;
		name: string;
		key: string;
		archived: boolean;
	};
};

/** Issue detail page context shared by sections and header actions. */
export type IssueDetailContext = {
	orgId: string;
	projectId: string;
	issueNumber: number;
	issueId: string;
	projectKey: string;
	frozen: boolean;
	/** Set when the issue is archived (favorite actions stay disabled). */
	archivedAt?: string | null;
};

/** Filter-bar badge context (active cycle chip etc.). */
export type ProjectFilterContext = {
	orgId: string;
	projectId: string;
	cycleId?: string;
	cycleName?: string;
	clearCycle: () => void;
};

/** Admin organization row context (per-row billing/quota actions). */
export type AdminOrgContext = {
	org: { id: string; name: string };
};

/** Project list row context (per-row favorite star etc.). */
export type ProjectRowContext = {
	orgId: string;
	frozen: boolean;
	project: { id: string; name: string; key: string; archived: boolean };
};

/** Desktop properties panel / mobile sheet action menu context. */
export type IssuePropertiesContext = {
	orgId: string;
	projectId: string;
	issueId: string;
	issueNumber: number;
	projectKey: string;
	disabled: boolean;
};

/** Cycle option used by the issue form and properties panel. */
export type IssueCycleOption = { id: string; name: string };

export type IssueTemplateOption = {
	id: string;
	name: string;
	projectId: string | null;
	/** Display label (organization-wide templates carry a suffix). */
	label: string;
};

/** Subset of the create-issue form a template can replace. */
export type IssueTemplatePrefill = {
	title: string;
	description: string;
	statusId?: string;
	priority: IssuePriorityName;
	labelIds: string[];
	estimate: string;
};

export type IssueTemplatesExtras = {
	options: IssueTemplateOption[];
	prefill: (
		templateId: string,
		current: IssueTemplatePrefill,
		availableLabelIds: readonly string[],
	) => IssueTemplatePrefill | null;
};

/** Star state for one entity (issue or project). */
export type IssueFavoriteState = {
	favorited: boolean;
	pending: boolean;
	toggle: () => void;
};

export type IssueViewDetachOptions = {
	search?: string;
	overrides?: { sort?: string; groupBy?: string; page?: number };
	extra?: Record<string, string | undefined>;
};

export type IssueViewStateArgs = {
	orgId: string;
	projectId: string;
	viewId?: string;
	layout: "list" | "board";
	canManage: boolean;
	currentUserId?: string;
	resolved: {
		filter?: IssueFilterGroup;
		sorts: readonly { field: string; direction: string }[];
		groupBy?: string;
		search: string;
		cycleId?: string;
	};
	setSearch: (next: Record<string, unknown>) => void;
	onSelectionReset: () => void;
};

/** Saved-view integration returned to the issue list page by `views`. */
export type IssueViewState = {
	currentViewQuery?: IssueQuery;
	detach: (
		filter: IssueFilterGroup | undefined,
		options?: IssueViewDetachOptions,
	) => void;
	updateSearch: (next: Record<string, unknown>) => void;
	toolbar?: ReactNode;
};

/** Data hooks optional features expose to the issue pages. */
export type IssueExtras = {
	useCycles?: (orgId: string, projectId: string) => IssueCycleOption[];
	useTemplates?: (
		orgId: string,
		projectId: string,
		enabled: boolean,
	) => IssueTemplatesExtras;
	useFavorite?: (
		orgId: string,
		entityType: "issue" | "project",
		entityId: string | undefined,
	) => IssueFavoriteState;
	useIssueViewState?: (
		args: IssueViewStateArgs,
	) => Pick<IssueViewState, "currentViewQuery">;
	useIssueViewDetach?: (
		args: IssueViewStateArgs,
	) => Pick<IssueViewState, "detach" | "updateSearch" | "toolbar">;
};

/** Draft file row rendered by the comment composer. */
export type CommentDraftFile = {
	id: string;
	file: File;
	error?: string;
};

/**
 * Structural mirror of the comment attachment draft hook
 * (`features/attachments/use-attachment-draft.ts`). Comments own the composer
 * and only consume the shape.
 */
export type CommentAttachmentDraft = {
	selected: CommentDraftFile[];
	files: File[];
	addFiles: (list: FileList | File[]) => void;
	removeFile: (id: string) => void;
	clear: () => void;
	newSignal: () => AbortSignal;
};

export type CommentUploadFailure = { file: File; error: unknown };

/** Attachment hooks the comment composer consumes when attachments exist. */
export type CommentAttachmentExtras = {
	useDraft?: (maxSize: number) => CommentAttachmentDraft;
	useMaxSize?: (orgId: string) => number;
	useDeleteAttachment?: (
		orgId: string,
		projectId: string,
		issueNumber: number,
		callbacks?: { onSuccess?: () => void },
	) => {
		mutate: (input: { commentId: string; attachmentId: string }) => void;
		isPending: boolean;
		isError: boolean;
		error: Error | null;
	};
	uploadErrorKey?: (error: unknown) => TranslationKey;
	uploadFiles?: (
		orgId: string,
		projectId: string,
		issueNumber: number,
		commentId: string,
		files: readonly File[],
		signal: AbortSignal,
	) => Promise<CommentUploadFailure[]>;
};

/** Avatar/logo media operations contributed by the attachments feature. */
export type WebMediaActions = {
	uploadAvatar: (file: File) => Promise<string>;
	deleteAvatar: (url: string) => Promise<void>;
	uploadOrganizationLogo: (file: File) => Promise<string>;
	deleteOrganizationLogo: (url: string) => Promise<void>;
};

/**
 * Feature-provided storage limits: billing derives the attachment cap from the
 * org plan; a trimmed registry falls back to the shared Pro constant.
 */
export type WebStorageLimits = {
	useAttachmentMaxSize: (orgId: string) => number;
};

/**
 * What a feature contributes to the web shell. `features/<id>/web.ts` exports
 * one of these; `features/registry.ts` aggregates them. The create-app CLI
 * (Phase 6) rewrites the registry per preset, so trimming a feature also removes every
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
	/** Plan-derived storage limits (attachments read this without billing). */
	storageLimits?: WebStorageLimits;
	/** Opens this feature's panel from the command palette. */
	palettePanel?: WebPalettePanel;
	/** Locale namespaces this feature owns (`i18n/locales/<lang>/<ns>.ts`). */
	i18nNamespaces?: string[];
	/** Data hooks the issue pages consume (cycles, templates, favorites, views). */
	issueExtras?: IssueExtras;
	/** Extra buttons in the project page header. */
	projectHeaderActions?: readonly WebOrderedComponent<ProjectPageContext>[];
	/** Extra items in the project page mobile overflow menu. */
	projectMenuItems?: readonly WebOrderedComponent<ProjectPageContext>[];
	/** Banners below the project page header (e.g. the current cycle card). */
	projectBanners?: readonly WebOrderedComponent<ProjectPageContext>[];
	/** Badges in the issue list filter bars (active cycle chip). */
	projectFilterBadges?: readonly WebOrderedComponent<ProjectFilterContext>[];
	/** Sections on the issue detail page, above the activity timeline. */
	issueDetailSections?: readonly WebOrderedComponent<IssueDetailContext>[];
	/** Icon actions in the issue detail breadcrumb row (favorite, subscription). */
	issueHeaderActions?: readonly WebOrderedComponent<IssueDetailContext>[];
	/** Items in the issue properties action menu (make recurring...). */
	issuePropertiesActions?: readonly WebOrderedComponent<IssuePropertiesContext>[];
	/** Upgrade link rendered by the core quota-error component. */
	quotaUpgrade?: ComponentType<{ orgId: string; error: Error }>;
	/** Per-row admin organization actions (billing quota editor). */
	adminOrgActions?: readonly WebOrderedComponent<AdminOrgContext>[];
	/** Attachment hooks the comment composer consumes (draft/upload/delete). */
	commentExtras?: CommentAttachmentExtras;
	/** Avatar/logo uploads used by the auth and organization providers. */
	mediaActions?: WebMediaActions;
	/** Landing page pricing section (billing). */
	landingPricing?: ComponentType;
	/** Project list row actions (favorite star). */
	projectRowActions?: readonly WebOrderedComponent<ProjectRowContext>[];
	/** API docs header action (manage API keys). */
	apiDocsAction?: ComponentType<{ orgId: string }>;
	/** API keys settings header action (view API docs); null when public-api is trimmed. */
	apiKeysDocsAction?: ComponentType;
};
