import { SettingsIcon, ShieldIcon, TagIcon, UsersIcon } from "lucide-react";
import { mergePaletteActions } from "@/features/registry";
import type { PaletteAction, PaletteActionContext } from "@/features/web-types";

export type { PaletteAction, PaletteActionContext } from "@/features/web-types";

/**
 * Shell-owned palette actions (settings shortcuts, API docs and admin).
 * Feature actions live in `features/<id>/web.ts`; `mergePaletteActions`
 * interleaves both groups in the shell's stable render order.
 */
export const CORE_PALETTE_ACTIONS: readonly PaletteAction[] = [
	{
		id: "settings-general",
		labelKey: "command.settingsGeneral",
		icon: SettingsIcon,
		run: (ctx) =>
			ctx.navigate({
				to: "/orgs/$orgId/settings",
				params: { orgId: ctx.orgId },
			}),
	},
	{
		id: "settings-members",
		labelKey: "command.settingsMembers",
		icon: UsersIcon,
		run: (ctx) =>
			ctx.navigate({
				to: "/orgs/$orgId/settings/members",
				params: { orgId: ctx.orgId },
			}),
	},
	{
		id: "settings-labels",
		labelKey: "command.settingsLabels",
		icon: TagIcon,
		run: (ctx) =>
			ctx.navigate({
				to: "/orgs/$orgId/settings/labels",
				params: { orgId: ctx.orgId },
			}),
	},
	{
		id: "admin",
		labelKey: "command.goToAdmin",
		icon: ShieldIcon,
		when: (ctx) => ctx.isAdmin,
		run: (ctx) => ctx.navigate({ to: "/admin" }),
	},
];

/**
 * The "Actions" group, in its original render order: feature contributions
 * plus the core shortcuts above. Conditions that used to be inline JSX guards
 * (`currentProjectId &&`, `canManage && <>`, `isAdmin &&`) stay expressed as
 * `when` predicates so visibility, labels, icons and navigation targets are
 * identical to the hand-written list.
 */
export const PALETTE_ACTIONS: readonly PaletteAction[] =
	mergePaletteActions(CORE_PALETTE_ACTIONS);

/** Actions visible for the current route, role and session. */
export function buildPaletteActions(
	ctx: PaletteActionContext,
): PaletteAction[] {
	return PALETTE_ACTIONS.filter((action) => action.when?.(ctx) ?? true);
}
