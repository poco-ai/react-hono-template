import { createFileRoute, redirect } from "@tanstack/react-router";
import { billingSearchSchema } from "@/features/billing/search";
import { MANAGE_ROLES, membersQuery } from "@/features/members/data";
import { BillingSettingsPage } from "@/pages/org-settings/billing";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/billing")({
	validateSearch: billingSearchSchema,
	beforeLoad: async ({ context, params }) => {
		const members = await context.queryClient.ensureQueryData(
			membersQuery(params.orgId),
		);
		const role = members.find(
			(member) => member.userId === context.session.user.id,
		)?.role;
		if (!role || !(MANAGE_ROLES as string[]).includes(role)) {
			throw redirect({
				to: "/orgs/$orgId/settings",
				params: { orgId: params.orgId },
				search: { denied: true },
			});
		}
	},
	component: () => {
		const { orgId } = Route.useParams();
		return <BillingSettingsPage orgId={orgId} />;
	},
});
