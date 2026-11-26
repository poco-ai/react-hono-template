import { ATTACHMENT_MAX_SIZE } from "@workspace/shared";
import { activitiesWeb } from "./activities/web";
import { aiWeb } from "./ai/web";
import { apiKeysWeb } from "./api-keys/web";
import { attachmentsWeb } from "./attachments/web";
import { billingWeb } from "./billing/web";
import { commentsWeb } from "./comments/web";
import { cyclesWeb } from "./cycles/web";
import { favoritesWeb } from "./favorites/web";
import { issuesWeb } from "./issues/web";
import { labelsWeb } from "./labels/web";
import { mcpWeb } from "./mcp/web";
import { notificationsWeb } from "./notifications/web";
import { projectUpdatesWeb } from "./project-updates/web";
import { projectsWeb } from "./projects/web";
import { publicApiWeb } from "./public-api/web";
import { recurrencesWeb } from "./recurrences/web";
import { relationsWeb } from "./relations/web";
import { roadmapWeb } from "./roadmap/web";
import { statusesWeb } from "./statuses/web";
import { templatesWeb } from "./templates/web";
import { viewsWeb } from "./views/web";
import type {
	AdminOrgContext,
	CommentAttachmentExtras,
	IssueDetailContext,
	IssueExtras,
	IssuePropertiesContext,
	IssueViewState,
	IssueViewStateArgs,
	MobileTabItem,
	OrgSidebarNavItem,
	PaletteAction,
	ProjectFilterContext,
	ProjectPageContext,
	ProjectRowContext,
	SettingsNavItem,
	WebFeatureDecl,
	WebMediaActions,
	WebOrderedComponent,
	WebPalettePanel,
	WebPanel,
	WebProjectExtras,
	WebProvider,
	WebSidebarSection,
	WebStorageLimits,
} from "./web-types";
import { webhooksWeb } from "./webhooks/web";

/**
 * Web feature registry — the single injection point the create-app CLI
 * (Phase 6) rewrites per preset, mirroring `apps/api/src/manifest.ts`.
 *
 * The template repository always ships the full set. Features without a web
 * surface (`capabilities`, `public-api`, `search`) and
 * features owned by the core shell (`admin`, `audit`, `auth`, `members`,
 * `organizations`) have no `web.ts` and are therefore absent here.
 *
 * ORDER: same registration order as the api manifest. Render order is *not*
 * derived from this list — the shell owns it through the `*_ORDER` maps
 * below, because one feature can contribute entries that are not adjacent
 * (e.g. `issues` owns both `my-issues` and `triage`).
 */
export const WEB_FEATURES: readonly WebFeatureDecl[] = [
	billingWeb,
	webhooksWeb,
	attachmentsWeb,
	projectsWeb,
	publicApiWeb,
	projectUpdatesWeb,
	cyclesWeb,
	roadmapWeb,
	viewsWeb,
	statusesWeb,
	notificationsWeb,
	issuesWeb,
	labelsWeb,
	recurrencesWeb,
	favoritesWeb,
	relationsWeb,
	templatesWeb,
	commentsWeb,
	activitiesWeb,
	apiKeysWeb,
	aiWeb,
	mcpWeb,
];

/**
 * Shell-owned render order. A contribution whose id is missing from its map
 * fails fast at startup so a new entry cannot silently disappear; ids that
 * are present in the map but not contributed are ignored, which is what a
 * create-app-trimmed registry relies on.
 */
const SIDEBAR_ORDER = [
	"inbox",
	"my-issues",
	"favorites",
	"roadmap",
	"triage",
	"activity",
	"projects",
] as const;

const PALETTE_ORDER = [
	"ask-ai",
	"new-issue",
	"new-project",
	"inbox",
	"my-issues",
	"activity",
	"settings-general",
	"settings-members",
	"settings-labels",
	"settings-api-keys",
	"settings-webhooks",
	"settings-billing",
	"api-docs",
	"admin",
] as const;

const SETTINGS_ORDER = [
	"general",
	"members",
	"labels",
	"statuses",
	"templates",
	"ai",
	"api-keys",
	"mcp",
	"webhooks",
	"audit",
	"billing",
] as const;

const MOBILE_TAB_ORDER = ["inbox", "my-issues", "projects", "ai"] as const;

function mergeById<T extends { id: string }>(
	surface: string,
	order: readonly string[],
	items: readonly T[],
): T[] {
	const byId = new Map<string, T>();
	for (const item of items) {
		if (byId.has(item.id)) {
			throw new Error(`duplicate ${surface} web contribution "${item.id}"`);
		}
		byId.set(item.id, item);
	}
	const unordered = [...byId.keys()].filter((id) => !order.includes(id));
	if (unordered.length > 0) {
		throw new Error(
			`${surface} web contributions missing from the shell order: ${unordered.join(", ")}`,
		);
	}
	return order.flatMap((id) => {
		const item = byId.get(id);
		return item ? [item] : [];
	});
}

/** Core sidebar entries + every registered feature, in shell order. */
export function mergeSidebarNav(
	core: readonly OrgSidebarNavItem[],
): OrgSidebarNavItem[] {
	return mergeById("sidebar", SIDEBAR_ORDER, [
		...core,
		...WEB_FEATURES.flatMap((feature) => feature.nav?.() ?? []),
	]);
}

/** Core palette actions + every registered feature, in shell order. */
export function mergePaletteActions(
	core: readonly PaletteAction[],
): PaletteAction[] {
	return mergeById("palette", PALETTE_ORDER, [
		...core,
		...WEB_FEATURES.flatMap((feature) => feature.paletteActions?.() ?? []),
	]);
}

/** Core settings entries + every registered feature, in shell order. */
export function mergeSettingsNav(
	core: readonly SettingsNavItem[],
): SettingsNavItem[] {
	return mergeById("settings", SETTINGS_ORDER, [
		...core,
		...WEB_FEATURES.flatMap((feature) => feature.settingsNav?.() ?? []),
	]);
}

/** Core bottom tabs + every registered feature, in shell order. */
export function mergeMobileTabs(
	core: readonly MobileTabItem[],
): MobileTabItem[] {
	return mergeById("mobile-tabs", MOBILE_TAB_ORDER, [
		...core,
		...WEB_FEATURES.flatMap((feature) => feature.mobileTabs?.() ?? []),
	]);
}

/** Global providers contributed by enabled features (outermost first). */
export function webProviders(): WebProvider[] {
	return WEB_FEATURES.flatMap((feature) => feature.providers ?? []);
}

/** Extra sidebar sections contributed by enabled features (above the nav). */
export function webSidebarSections(): WebSidebarSection[] {
	return WEB_FEATURES.flatMap((feature) => feature.sidebarSections ?? []);
}

/** Extra rows rendered under a project entry by enabled features. */
export function webProjectExtras(): readonly WebProjectExtras[] {
	return WEB_FEATURES.flatMap((feature) => feature.projectExtras ?? []);
}

/** Fullscreen panels mounted at the end of the org layout. */
export function webPanels(): WebPanel[] {
	return WEB_FEATURES.flatMap((feature) => feature.panels ?? []);
}

const DEFAULT_STORAGE_LIMITS: WebStorageLimits = {
	useAttachmentMaxSize: () => ATTACHMENT_MAX_SIZE,
};

/** Plan-derived storage limits; the shared Pro default when billing is trimmed. */
export function webStorageLimits(): WebStorageLimits {
	return (
		WEB_FEATURES.find((feature) => feature.storageLimits)?.storageLimits ??
		DEFAULT_STORAGE_LIMITS
	);
}

const NOOP_PALETTE_PANEL: WebPalettePanel = { useOpen: () => () => {} };

/**
 * The feature (currently only `ai`) that owns a command-palette panel. A
 * trimmed registry falls back to a noop opener so the palette still compiles.
 */
export function webPalettePanel(): WebPalettePanel {
	return (
		WEB_FEATURES.find((feature) => feature.palettePanel)?.palettePanel ??
		NOOP_PALETTE_PANEL
	);
}

// ---------------------------------------------------------------------------
// Page contributions
// ---------------------------------------------------------------------------

function mergeOrdered<Context>(
	groups: readonly (readonly WebOrderedComponent<Context>[])[],
): WebOrderedComponent<Context>[] {
	const entries = groups.flatMap((group) => [...group]);
	return entries
		.map((entry, index) => ({ entry, index }))
		.sort(
			(left, right) =>
				left.entry.order - right.entry.order || left.index - right.index,
		)
		.map(({ entry }) => entry);
}

/** Issue page data hooks; the first contributor of each key wins. */
export function webIssueExtras(): IssueExtras {
	const extras: IssueExtras = {};
	for (const feature of WEB_FEATURES) {
		if (!feature.issueExtras) continue;
		for (const [key, value] of Object.entries(feature.issueExtras)) {
			if (value) (extras as Record<string, unknown>)[key] = value;
		}
	}
	return extras;
}

/** Saved-view integration; undefined when the views feature is trimmed. */
export function webIssueViewState(
	args: IssueViewStateArgs,
): Pick<IssueViewState, "currentViewQuery"> | undefined {
	const hook = webIssueExtras().useIssueViewState;
	return hook?.(args);
}

/** Detach/toolbar half of saved views (called after the query is resolved). */
export function webIssueViewDetach(
	args: IssueViewStateArgs,
): Pick<IssueViewState, "detach" | "updateSearch" | "toolbar"> | undefined {
	const hook = webIssueExtras().useIssueViewDetach;
	return hook?.(args);
}

export function webProjectHeaderActions(): readonly WebOrderedComponent<ProjectPageContext>[] {
	return mergeOrdered(
		WEB_FEATURES.map((feature) => feature.projectHeaderActions ?? []),
	);
}

export function webProjectMenuItems(): readonly WebOrderedComponent<ProjectPageContext>[] {
	return mergeOrdered(
		WEB_FEATURES.map((feature) => feature.projectMenuItems ?? []),
	);
}

export function webProjectBanners(): readonly WebOrderedComponent<ProjectPageContext>[] {
	return mergeOrdered(
		WEB_FEATURES.map((feature) => feature.projectBanners ?? []),
	);
}

export function webProjectFilterBadges(): readonly WebOrderedComponent<ProjectFilterContext>[] {
	return mergeOrdered(
		WEB_FEATURES.map((feature) => feature.projectFilterBadges ?? []),
	);
}

export function webIssueDetailSections(): readonly WebOrderedComponent<IssueDetailContext>[] {
	return mergeOrdered(
		WEB_FEATURES.map((feature) => feature.issueDetailSections ?? []),
	);
}

export function webIssueHeaderActions(): readonly WebOrderedComponent<IssueDetailContext>[] {
	return mergeOrdered(
		WEB_FEATURES.map((feature) => feature.issueHeaderActions ?? []),
	);
}

export function webIssuePropertiesActions(): readonly WebOrderedComponent<IssuePropertiesContext>[] {
	return mergeOrdered(
		WEB_FEATURES.map((feature) => feature.issuePropertiesActions ?? []),
	);
}

/** Upgrade link for plan-limit errors; null when billing is trimmed. */
export function webQuotaUpgrade(): WebFeatureDecl["quotaUpgrade"] | null {
	return (
		WEB_FEATURES.find((feature) => feature.quotaUpgrade)?.quotaUpgrade ?? null
	);
}

/** Landing pricing section; null when billing is trimmed. */
export function webLandingPricing(): WebFeatureDecl["landingPricing"] | null {
	return (
		WEB_FEATURES.find((feature) => feature.landingPricing)?.landingPricing ??
		null
	);
}

export function webAdminOrgActions(): readonly WebOrderedComponent<AdminOrgContext>[] {
	return mergeOrdered(
		WEB_FEATURES.map((feature) => feature.adminOrgActions ?? []),
	);
}

export function webProjectRowActions(): readonly WebOrderedComponent<ProjectRowContext>[] {
	return mergeOrdered(
		WEB_FEATURES.map((feature) => feature.projectRowActions ?? []),
	);
}

/** API docs header action; null when api-keys is trimmed. */
export function webApiDocsAction(): WebFeatureDecl["apiDocsAction"] | null {
	return (
		WEB_FEATURES.find((feature) => feature.apiDocsAction)?.apiDocsAction ?? null
	);
}

/** Attachment hooks for the comment composer; empty when attachments is trimmed. */
export function webCommentExtras(): CommentAttachmentExtras {
	const extras: CommentAttachmentExtras = {};
	for (const feature of WEB_FEATURES) {
		if (!feature.commentExtras) continue;
		for (const [key, value] of Object.entries(feature.commentExtras)) {
			if (value) (extras as Record<string, unknown>)[key] = value;
		}
	}
	return extras;
}

const MEDIA_UNAVAILABLE = () =>
	Promise.reject(new Error("Attachments are not enabled in this project"));

/** Avatar/logo uploads; a trimmed attachments feature fails closed. */
export function webMediaActions(): WebMediaActions {
	return (
		WEB_FEATURES.find((feature) => feature.mediaActions)?.mediaActions ?? {
			uploadAvatar: MEDIA_UNAVAILABLE as WebMediaActions["uploadAvatar"],
			deleteAvatar: async () => {},
			uploadOrganizationLogo:
				MEDIA_UNAVAILABLE as WebMediaActions["uploadOrganizationLogo"],
			deleteOrganizationLogo: async () => {},
		}
	);
}
