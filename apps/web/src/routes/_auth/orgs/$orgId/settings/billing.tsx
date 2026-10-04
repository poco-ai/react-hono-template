import { createFileRoute } from "@tanstack/react-router";
import { billingSearchSchema } from "@/features/billing/search";
import { BillingSettingsPage } from "@/pages/org-settings/billing";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/billing")({
	validateSearch: billingSearchSchema,
	component: () => {
		const { orgId } = Route.useParams();
		return <BillingSettingsPage orgId={orgId} />;
	},
});
