import { RelationsSection } from "@/features/relations/components/relations-section";
import type { IssueDetailContext, WebFeatureDecl } from "@/features/web-types";

function IssueRelationsSection(context: IssueDetailContext) {
	return (
		<RelationsSection
			orgId={context.orgId}
			projectId={context.projectId}
			projectKey={context.projectKey}
			issueId={context.issueId}
			issueNumber={context.issueNumber}
			frozen={context.frozen}
		/>
	);
}

/** Relations: issue-to-issue links rendered inside the issue detail page. */
export const relationsWeb: WebFeatureDecl = {
	id: "relations",
	issueDetailSections: [
		{ id: "relations", order: 10, component: IssueRelationsSection },
	],
};
