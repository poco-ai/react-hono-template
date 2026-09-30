import { createFileRoute } from "@tanstack/react-router";
import { type IssuesSearch, issueSearchSchema } from "@/features/issues/search";
import { ProjectIssuesPage } from "@/pages/project-issues";

export const Route = createFileRoute("/_auth/orgs/$orgId/projects/$projectId/")(
	{
		validateSearch: issueSearchSchema,
		component: ProjectIssuesRoute,
	},
);

function ProjectIssuesRoute() {
	const { orgId, projectId } = Route.useParams();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();

	const setSearch = (next: Partial<IssuesSearch>) => {
		navigate({
			search: (prev) => {
				const merged = { ...prev, ...next };
				const cleaned = Object.fromEntries(
					Object.entries(merged).filter(
						([, value]) => value !== "" && value !== undefined,
					),
				);
				return cleaned as typeof merged;
			},
		});
	};

	return (
		<ProjectIssuesPage
			orgId={orgId}
			projectId={projectId}
			search={search}
			setSearch={setSearch}
		/>
	);
}
