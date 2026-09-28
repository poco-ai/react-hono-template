import { createFileRoute } from "@tanstack/react-router";
import { MembersSettingsPage } from "@/pages/org-settings/members";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/members")({
	component: () => {
		const { orgId } = Route.useParams();
		return <MembersSettingsPage orgId={orgId} />;
	},
});
