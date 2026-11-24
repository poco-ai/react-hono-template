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
import { recurrencesWeb } from "./recurrences/web";
import { roadmapWeb } from "./roadmap/web";
import { statusesWeb } from "./statuses/web";
import { templatesWeb } from "./templates/web";
import type {
	MobileTabItem,
	OrgSidebarNavItem,
	PaletteAction,
	SettingsNavItem,
	WebFeatureDecl,
	WebPalettePanel,
	WebPanel,
	WebProjectExtras,
	WebProvider,
	WebSidebarSection,
} from "./web-types";
import { webhooksWeb } from "./webhooks/web";

/**
 * Web feature registry — the single injection point the scaffold (Phase 6)
 * rewrites per preset, mirroring `apps/api/src/manifest.ts`.
 *
 * The template repository always ships the full set. Features without a web
 * surface (`capabilities`, `public-api`, `relations`, `search`, `views`) and
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
	projectUpdatesWeb,
	cyclesWeb,
	roadmapWeb,
	statusesWeb,
	notificationsWeb,
	issuesWeb,
	labelsWeb,
	recurrencesWeb,
	favoritesWeb,
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
 * scaffold-trimmed registry relies on.
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
