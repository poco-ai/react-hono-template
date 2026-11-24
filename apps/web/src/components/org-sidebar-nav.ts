import { mergeSidebarNav } from "@/features/registry";
import type { OrgSidebarNavItem } from "@/features/web-types";

export type {
	OrgSidebarNavContext,
	OrgSidebarNavItem,
	OrgSidebarNavLabelKey,
	OrgSidebarNavTo,
} from "@/features/web-types";

/**
 * Shell-owned sidebar entries. The workspace entries all migrate to feature
 * registries (`features/<id>/web.ts`); this array keeps a place for future
 * core-only destinations while preserving the "core base + registry" merge.
 */
export const CORE_SIDEBAR_NAV: readonly OrgSidebarNavItem[] = [];

/**
 * The workspace navigation, in stable render order. Features contribute their
 * entries through `features/registry.ts`; the shell owns only the ordering
 * (`SIDEBAR_ORDER`) and the `when` predicate contract.
 *
 * Resolved lazily: `features/registry.ts` imports every `web.ts`, and the AI
 * sidebar section imports `org-sidebar-link` — evaluating the merge at module
 * scope would close that import cycle before `SIDEBAR_ORDER` initializes.
 */
let resolved: OrgSidebarNavItem[] | undefined;

export function orgSidebarNav(): readonly OrgSidebarNavItem[] {
	resolved ??= mergeSidebarNav(CORE_SIDEBAR_NAV);
	return resolved;
}
