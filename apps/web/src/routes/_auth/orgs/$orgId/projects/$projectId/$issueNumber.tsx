import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { IssueDetailPage } from "@/pages/issue-detail";

export const Route = createFileRoute(
	"/_auth/orgs/$orgId/projects/$projectId/$issueNumber",
)({
	params: {
		parse: (params) => ({
			projectId: params.projectId,
			issueNumber: z.coerce.number().int().min(1).parse(params.issueNumber),
		}),
	},
	component: () => {
		const { orgId, projectId, issueNumber } = Route.useParams();
		return (
			<IssueDetailPage
				orgId={orgId}
				projectId={projectId}
				issueNumber={issueNumber}
			/>
		);
	},
});
