import { createFileRoute } from "@tanstack/react-router";
import { LabelsSettingsPage } from "@/pages/org-settings/labels";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/labels")({
	component: () => {
		const { orgId } = Route.useParams();
		return <LabelsSettingsPage orgId={orgId} />;
	},
});
