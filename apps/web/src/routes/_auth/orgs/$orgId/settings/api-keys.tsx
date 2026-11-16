import { createFileRoute } from "@tanstack/react-router";
import { apiKeysSearchSchema } from "@/features/api-keys/search";
import { requireManageRole } from "@/features/members/guards";
import { ApiKeysSettingsPage } from "@/pages/org-settings/api-keys";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/api-keys")({
	validateSearch: apiKeysSearchSchema,
	beforeLoad: ({ context, params }) =>
		requireManageRole({
			queryClient: context.queryClient,
			orgId: params.orgId,
			userId: context.session.user.id,
		}),
	component: () => {
		const { orgId } = Route.useParams();
		return <ApiKeysSettingsPage orgId={orgId} />;
	},
});
