import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { type IssuesSearch, ProjectIssuesPage } from "@/pages/project-issues";

const searchSchema = z.object({
	page: z.coerce.number().int().min(1).catch(1),
	status: z.string().optional().catch(""),
	priority: z.string().optional().catch(""),
	assigneeId: z.string().optional().catch(""),
	labelId: z.string().optional().catch(""),
	search: z.string().optional().catch(""),
	sort: z.enum(["updated", "created", "priority"]).catch("updated"),
	view: z.enum(["list", "board"]).optional().catch("list"),
});

export const Route = createFileRoute("/_auth/orgs/$orgId/projects/$projectId/")(
	{
		validateSearch: searchSchema,
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
