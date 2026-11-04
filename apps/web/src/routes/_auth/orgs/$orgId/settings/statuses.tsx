import { createFileRoute } from "@tanstack/react-router";
import { StatusesSettingsPage } from "@/pages/org-settings/statuses";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/statuses")({
	component: () => {
		const { orgId } = Route.useParams();
		return <StatusesSettingsPage orgId={orgId} />;
	},
});
