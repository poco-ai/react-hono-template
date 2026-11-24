import { CirclePlusIcon, Filter, Inbox, ListTodoIcon } from "lucide-react";
import type { WebFeatureDecl } from "@/features/web-types";

/** Issues: workspace entries (my-issues + triage) and issue palette actions. */
export const issuesWeb: WebFeatureDecl = {
	id: "issues",
	i18nNamespaces: ["issues", "triage"],
	nav: () => [
		{
			id: "my-issues",
			to: "/orgs/$orgId/my-issues",
			exact: true,
			labelKey: "nav.myIssues",
			icon: Inbox,
		},
		{
			id: "triage",
			to: "/orgs/$orgId/triage",
			exact: true,
			labelKey: "nav.triage",
			icon: Filter,
		},
	],
	paletteActions: () => [
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
			id: "my-issues",
			labelKey: "command.goToMyIssues",
			icon: ListTodoIcon,
			run: (ctx) =>
				ctx.navigate({
					to: "/orgs/$orgId/my-issues",
					params: { orgId: ctx.orgId },
				}),
		},
	],
	mobileTabs: () => [
		{
			id: "my-issues",
			to: "/orgs/$orgId/my-issues",
			labelKey: "nav.myIssues",
			icon: Inbox,
			exact: true,
		},
	],
};
