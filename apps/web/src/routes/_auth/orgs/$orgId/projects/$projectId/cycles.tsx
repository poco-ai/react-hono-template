import { createFileRoute } from "@tanstack/react-router";
import { ProjectCyclesPage } from "@/pages/project-cycles";

export const Route = createFileRoute(
	"/_auth/orgs/$orgId/projects/$projectId/cycles",
)({
	component: ProjectCyclesRoute,
});

function ProjectCyclesRoute() {
	const { orgId, projectId } = Route.useParams();
	return <ProjectCyclesPage orgId={orgId} projectId={projectId} />;
}
