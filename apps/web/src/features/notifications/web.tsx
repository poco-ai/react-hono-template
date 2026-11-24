import { Bell, InboxIcon } from "lucide-react";
import { IssueSubscriptionButton } from "@/features/notifications/components/issue-subscription-button";
import type { IssueDetailContext, WebFeatureDecl } from "@/features/web-types";

function IssueSubscriptionAction(context: IssueDetailContext) {
	return (
		<IssueSubscriptionButton
			orgId={context.orgId}
			projectId={context.projectId}
			issueNumber={context.issueNumber}
			disabled={context.frozen}
		/>
	);
}

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
	issueHeaderActions: [
		{ id: "subscription", order: 20, component: IssueSubscriptionAction },
	],
};
