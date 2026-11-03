import { createFileRoute } from "@tanstack/react-router";
import { AiSettingsPage } from "@/pages/org-settings/ai";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/ai")({
	component: AiSettingsRoute,
});

function AiSettingsRoute() {
	const { orgId } = Route.useParams();
	return <AiSettingsPage orgId={orgId} />;
}
