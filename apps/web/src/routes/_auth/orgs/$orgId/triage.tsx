import { createFileRoute } from "@tanstack/react-router";
import { type TriageSearch, triageSearchSchema } from "@/features/triage/data";
import { TriagePage } from "@/pages/triage";

export const Route = createFileRoute("/_auth/orgs/$orgId/triage")({
	validateSearch: triageSearchSchema,
	component: TriageRoute,
});

function TriageRoute() {
	const { orgId } = Route.useParams();
	const search = Route.useSearch() as TriageSearch;
	const navigate = Route.useNavigate();

	return (
		<TriagePage
			orgId={orgId}
			search={search}
			onProjectChange={(projectId) =>
				void navigate({
					search: (prev) => ({ ...prev, projectId }),
				})
			}
		/>
	);
}
