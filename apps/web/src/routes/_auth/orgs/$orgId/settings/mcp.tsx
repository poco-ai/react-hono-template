import { createFileRoute } from "@tanstack/react-router";
import { McpSettingsPage } from "@/pages/org-settings/mcp";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/mcp")({
	component: McpSettingsRoute,
});

function McpSettingsRoute() {
	const { orgId } = Route.useParams();
	return <McpSettingsPage orgId={orgId} />;
}
