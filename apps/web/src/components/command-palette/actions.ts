import type { useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	ActivityIcon,
	BookOpenIcon,
	CirclePlusIcon,
	CreditCardIcon,
	InboxIcon,
	KeyRoundIcon,
	ListTodoIcon,
	PlusIcon,
	SettingsIcon,
	ShieldIcon,
	Sparkles,
	TagIcon,
	UsersIcon,
	WebhookIcon,
} from "lucide-react";
import type { TranslationKey } from "@/lib/errors";

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

/**
 * The "Actions" group, in its original render order. Conditions that used to be
 * inline JSX guards (`currentProjectId &&`, `canManage && <>`, `isAdmin &&`) are
 * expressed as `when` predicates so visibility, labels, icons and navigation
 * targets stay identical to the hand-written list.
 */
export const PALETTE_ACTIONS: readonly PaletteAction[] = [
	{
		id: "ask-ai",
		labelKey: "command.askAi",
		icon: Sparkles,
		run: (ctx) => {
			ctx.setPanelOpen(true);
		},
	},
	{
		id: "new-issue",
		labelKey: "command.newIssue",
		icon: CirclePlusIcon,
		when: (ctx) => Boolean(ctx.currentProjectId),
		run: (ctx) => {
			const projectId = ctx.currentProjectId;
			if (!projectId) return;
			return ctx.navigate({
				to: "/orgs/$orgId/projects/$projectId",
				params: { orgId: ctx.orgId, projectId },
				search: { page: 1, sort: "updated", new: true },
			});
		},
	},
	{
		id: "new-project",
		labelKey: "command.newProject",
		icon: PlusIcon,
		run: (ctx) =>
			ctx.navigate({
				to: "/orgs/$orgId/projects",
				params: { orgId: ctx.orgId },
			}),
	},
	{
		id: "inbox",
		labelKey: "command.goToInbox",
		icon: InboxIcon,
		run: (ctx) =>
			ctx.navigate({
				to: "/orgs/$orgId/inbox",
				params: { orgId: ctx.orgId },
				search: { filter: "all" },
			}),
	},
	{
		id: "my-issues",
		labelKey: "command.goToMyIssues",
		icon: ListTodoIcon,
		run: (ctx) =>
			ctx.navigate({
				to: "/orgs/$orgId/my-issues",
				params: { orgId: ctx.orgId },
			}),
	},
	{
		id: "activity",
		labelKey: "command.goToActivity",
		icon: ActivityIcon,
		run: (ctx) =>
			ctx.navigate({
				to: "/orgs/$orgId/activity",
				params: { orgId: ctx.orgId },
			}),
	},
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
		id: "settings-api-keys",
		labelKey: "command.settingsApiKeys",
		icon: KeyRoundIcon,
		when: (ctx) => ctx.canManage,
		run: (ctx) =>
			ctx.navigate({
				to: "/orgs/$orgId/settings/api-keys",
				params: { orgId: ctx.orgId },
			}),
	},
	{
		id: "settings-webhooks",
		labelKey: "command.settingsWebhooks",
		icon: WebhookIcon,
		when: (ctx) => ctx.canManage,
		run: (ctx) =>
			ctx.navigate({
				to: "/orgs/$orgId/settings/webhooks",
				params: { orgId: ctx.orgId },
			}),
	},
	{
		id: "settings-billing",
		labelKey: "command.settingsBilling",
		icon: CreditCardIcon,
		when: (ctx) => ctx.canManage,
		run: (ctx) =>
			ctx.navigate({
				to: "/orgs/$orgId/settings/billing",
				params: { orgId: ctx.orgId },
			}),
	},
	{
		id: "api-docs",
		labelKey: "command.goToApiDocs",
		icon: BookOpenIcon,
		run: (ctx) => ctx.navigate({ to: "/api-docs" }),
	},
	{
		id: "admin",
		labelKey: "command.goToAdmin",
		icon: ShieldIcon,
		when: (ctx) => ctx.isAdmin,
		run: (ctx) => ctx.navigate({ to: "/admin" }),
	},
];

/** Actions visible for the current route, role and session. */
export function buildPaletteActions(
	ctx: PaletteActionContext,
): PaletteAction[] {
	return PALETTE_ACTIONS.filter((action) => action.when?.(ctx) ?? true);
}
