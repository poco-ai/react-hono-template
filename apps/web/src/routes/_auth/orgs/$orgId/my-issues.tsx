import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { MyIssuesPage } from "@/pages/my-issues";

export const Route = createFileRoute("/_auth/orgs/$orgId/my-issues")({
	validateSearch: z.object({
		page: z.coerce.number().int().min(1).optional().catch(1),
	}),
	component: MyIssuesRoute,
});

function MyIssuesRoute() {
	const { orgId } = Route.useParams();
	const { page } = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<MyIssuesPage
			orgId={orgId}
			page={page ?? 1}
			onPageChange={(next) =>
				navigate({ search: (prev) => ({ ...prev, page: next }) })
			}
		/>
	);
}
