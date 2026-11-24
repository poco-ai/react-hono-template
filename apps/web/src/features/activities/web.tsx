import { useQuery } from "@tanstack/react-query";
import { Activity, ActivityIcon } from "lucide-react";
import { IssueActivityTimeline } from "@/features/activities/components/issue-activity";
import { labelsQuery } from "@/features/labels/data";
import { membersQuery } from "@/features/members/data";
import type { IssueDetailContext, WebFeatureDecl } from "@/features/web-types";

function IssueActivitySection(context: IssueDetailContext) {
	const members = useQuery(membersQuery(context.orgId));
	const labels = useQuery(labelsQuery(context.orgId));
	return (
		<IssueActivityTimeline
			orgId={context.orgId}
			projectId={context.projectId}
			issueNumber={context.issueNumber}
			members={members.data ?? []}
			labels={labels.data ?? []}
		/>
	);
}

/** Activity feed: sidebar entry, palette jump target, `activity` strings. */
export const activitiesWeb: WebFeatureDecl = {
	id: "activities",
	i18nNamespaces: ["activity"],
	nav: () => [
		{
			id: "activity",
			to: "/orgs/$orgId/activity",
			exact: true,
			labelKey: "nav.activity",
			icon: Activity,
		},
	],
	paletteActions: () => [
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
	],
	issueDetailSections: [
		{ id: "activity", order: 40, component: IssueActivitySection },
	],
};
