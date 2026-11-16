import { createFileRoute } from "@tanstack/react-router";
import { requireManageRole } from "@/features/members/guards";
import { WebhooksSettingsPage } from "@/pages/org-settings/webhooks";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/webhooks")({
	beforeLoad: ({ context, params }) =>
		requireManageRole({
			queryClient: context.queryClient,
			orgId: params.orgId,
			userId: context.session.user.id,
		}),
	component: () => {
		const { orgId } = Route.useParams();
		return <WebhooksSettingsPage orgId={orgId} />;
	},
});
