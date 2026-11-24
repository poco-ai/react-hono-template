import { Bell, InboxIcon } from "lucide-react";
import type { WebFeatureDecl } from "@/features/web-types";

/** Notifications: inbox sidebar entry, palette jump target and mobile tab. */
export const notificationsWeb: WebFeatureDecl = {
	id: "notifications",
	i18nNamespaces: ["notifications"],
	nav: () => [
		{
			id: "inbox",
			to: "/orgs/$orgId/inbox",
			exact: true,
			labelKey: "nav.inbox",
			icon: Bell,
			badge: "unread",
		},
	],
	paletteActions: () => [
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
	],
	mobileTabs: () => [
		{
			id: "inbox",
			to: "/orgs/$orgId/inbox",
			labelKey: "nav.inbox",
			icon: Bell,
			badge: "unread",
			exact: true,
			search: { filter: "all" },
		},
	],
};
