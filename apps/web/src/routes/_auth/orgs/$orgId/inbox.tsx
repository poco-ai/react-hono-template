import { createFileRoute } from "@tanstack/react-router";
import { inboxSearchSchema } from "@/features/notifications/search";
import { InboxPage } from "@/pages/inbox";

export const Route = createFileRoute("/_auth/orgs/$orgId/inbox")({
	validateSearch: inboxSearchSchema,
	component: () => {
		const { orgId } = Route.useParams();
		const search = Route.useSearch();
		const navigate = Route.useNavigate();

		return (
			<InboxPage
				orgId={orgId}
				filter={search.filter}
				onFilterChange={(filter) => navigate({ search: { filter } })}
			/>
		);
	},
});
