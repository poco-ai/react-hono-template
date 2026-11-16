import { createFileRoute } from "@tanstack/react-router";
import { requireManageRole } from "@/features/members/guards";
import { McpSettingsPage } from "@/pages/org-settings/mcp";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/mcp")({
	beforeLoad: ({ context, params }) =>
		requireManageRole({
			queryClient: context.queryClient,
			orgId: params.orgId,
			userId: context.session.user.id,
		}),
	component: McpSettingsRoute,
});

function McpSettingsRoute() {
	const { orgId } = Route.useParams();
	return <McpSettingsPage orgId={orgId} />;
}
