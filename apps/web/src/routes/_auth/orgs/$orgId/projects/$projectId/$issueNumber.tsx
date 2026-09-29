import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { NotFoundState } from "@/components/not-found-state";
import { IssueDetailPage } from "@/pages/issue-detail";

const issueNumberSchema = z.coerce.number().int().min(1);

function IssueNotFound() {
	const { t } = useTranslation();
	const { orgId, projectId } = Route.useParams();
	return (
		<NotFoundState
			title={t("issues.notFoundTitle")}
			action={
				<Link
					to="/orgs/$orgId/projects/$projectId"
					params={{ orgId, projectId }}
					search={{ page: 1, sort: "updated" }}
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					<ArrowLeft className="size-4" />
					{t("issues.backToProject")}
				</Link>
			}
		/>
	);
}

export const Route = createFileRoute(
	"/_auth/orgs/$orgId/projects/$projectId/$issueNumber",
)({
	params: {
		parse: (params) => ({
			projectId: params.projectId,
			issueNumber: params.issueNumber,
		}),
	},
	beforeLoad: ({ params }) => {
		if (!issueNumberSchema.safeParse(params.issueNumber).success) {
			throw notFound();
		}
	},
	component: () => {
		const { orgId, projectId, issueNumber } = Route.useParams();
		return (
			<IssueDetailPage
				orgId={orgId}
				projectId={projectId}
				issueNumber={Number(issueNumber)}
			/>
		);
	},
	notFoundComponent: IssueNotFound,
});
