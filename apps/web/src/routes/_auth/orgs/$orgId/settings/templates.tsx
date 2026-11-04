import { createFileRoute } from "@tanstack/react-router";
import { TemplatesSettingsPage } from "@/pages/org-settings/templates";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/templates")({
	component: () => {
		const { orgId } = Route.useParams();
		return <TemplatesSettingsPage orgId={orgId} />;
	},
});
