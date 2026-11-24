import { IssueComments } from "@/features/comments/components/issue-comments";
import type { IssueDetailContext, WebFeatureDecl } from "@/features/web-types";

function IssueCommentsSection(context: IssueDetailContext) {
	return (
		<IssueComments
			orgId={context.orgId}
			projectId={context.projectId}
			issueNumber={context.issueNumber}
			frozen={context.frozen}
		/>
	);
}

/** Comments own their composer/reaction strings and the issue detail section. */
export const commentsWeb: WebFeatureDecl = {
	id: "comments",
	i18nNamespaces: ["comments"],
	issueDetailSections: [
		{ id: "comments", order: 20, component: IssueCommentsSection },
	],
};
