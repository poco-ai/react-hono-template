import { createFileRoute } from "@tanstack/react-router";
import { GeneralSettingsPage } from "@/pages/org-settings/general";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/")({
	component: () => {
		const { orgId } = Route.useParams();
		return <GeneralSettingsPage orgId={orgId} />;
	},
});
