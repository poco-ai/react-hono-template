import { createFileRoute } from "@tanstack/react-router";
import { ProjectsPage } from "@/pages/projects";

export const Route = createFileRoute("/_auth/orgs/$orgId/projects/")({
	component: () => {
		const { orgId } = Route.useParams();
		return <ProjectsPage orgId={orgId} />;
	},
});
