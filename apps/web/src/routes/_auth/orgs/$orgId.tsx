import { createFileRoute, redirect } from "@tanstack/react-router";
import { OrgLayout } from "@/components/org-layout";
import { orgsQuery } from "@/features/organizations/data";

export const Route = createFileRoute("/_auth/orgs/$orgId")({
	beforeLoad: async ({ context, params }) => {
		// fetchQuery waits for a stale list. ensureQueryData can return a cached
		// empty list and bounce a just-created organization back to onboarding.
		const orgs = await context.queryClient.fetchQuery(orgsQuery());
		if (!orgs.some((org) => org.id === params.orgId)) {
			throw redirect({ to: "/" });
		}
	},
	component: OrgLayout,
});
