import { createFileRoute } from "@tanstack/react-router";
import { generalSettingsSearchSchema } from "@/features/organizations/search";
import { GeneralSettingsPage } from "@/pages/org-settings/general";

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/")({
	validateSearch: generalSettingsSearchSchema,
	component: () => {
		const { orgId } = Route.useParams();
		const { denied } = Route.useSearch();
		return <GeneralSettingsPage orgId={orgId} denied={denied} />;
	},
});
