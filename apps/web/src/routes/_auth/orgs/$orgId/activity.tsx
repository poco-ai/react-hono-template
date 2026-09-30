import { createFileRoute } from "@tanstack/react-router";
import { orgActivitySearchSchema } from "@/features/activities/search";
import { OrgActivityPage } from "@/pages/org-activity";

export const Route = createFileRoute("/_auth/orgs/$orgId/activity")({
	validateSearch: orgActivitySearchSchema,
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
