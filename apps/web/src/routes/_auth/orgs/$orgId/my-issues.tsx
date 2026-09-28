import { createFileRoute } from "@tanstack/react-router";
import { MyIssuesPage } from "@/pages/my-issues";

export const Route = createFileRoute("/_auth/orgs/$orgId/my-issues")({
	component: () => {
		const { orgId } = Route.useParams();
		return <MyIssuesPage orgId={orgId} />;
	},
});
