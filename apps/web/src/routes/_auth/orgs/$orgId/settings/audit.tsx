import { createFileRoute } from "@tanstack/react-router";
import { auditSearchSchema } from "@/features/audit/search";
import { requireManageRole } from "@/features/members/guards";
import { AuditSettingsPage } from "@/pages/org-settings/audit";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/audit")({
	validateSearch: auditSearchSchema,
	beforeLoad: ({ context, params }) =>
		requireManageRole({
			queryClient: context.queryClient,
			orgId: params.orgId,
			userId: context.session.user.id,
		}),
	component: () => {
		const { orgId } = Route.useParams();
		return <AuditSettingsPage orgId={orgId} />;
	},
});
