import { createFileRoute } from "@tanstack/react-router";
import { projectsSearchSchema } from "@/features/projects/search";
import { ProjectsPage } from "@/pages/projects";

export const Route = createFileRoute("/_auth/orgs/$orgId/projects/")({
	validateSearch: projectsSearchSchema,
	component: () => {
		const { orgId } = Route.useParams();
		return <ProjectsPage orgId={orgId} />;
	},
});
