import { createFileRoute, redirect } from "@tanstack/react-router";
import { OrgLayout } from "@/components/org-layout";
import { orgsQuery } from "@/features/organizations/data";

export const Route = createFileRoute("/_auth/orgs/$orgId")({
	beforeLoad: async ({ context, params }) => {
		const orgs = await context.queryClient.ensureQueryData(orgsQuery());
		if (!orgs.some((org) => org.id === params.orgId)) {
			throw redirect({ to: "/" });
		}
	},
	component: OrgLayout,
});
