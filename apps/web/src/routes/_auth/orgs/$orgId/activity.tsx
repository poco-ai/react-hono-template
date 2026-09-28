import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { OrgActivityPage } from "@/pages/org-activity";

const searchSchema = z.object({
	projectId: z.string().optional().catch(""),
});

export const Route = createFileRoute("/_auth/orgs/$orgId/activity")({
	validateSearch: searchSchema,
	component: () => {
		const { orgId } = Route.useParams();
		const search = Route.useSearch();
		const navigate = Route.useNavigate();

		const setProjectId = (projectId: string) => {
			navigate({ search: projectId ? { projectId } : {} });
		};

		return (
			<OrgActivityPage
				key={search.projectId ?? ""}
				orgId={orgId}
				projectId={search.projectId || undefined}
				onProjectChange={setProjectId}
			/>
		);
	},
});
