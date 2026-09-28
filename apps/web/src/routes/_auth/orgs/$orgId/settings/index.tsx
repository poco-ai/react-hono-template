import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { GeneralSettingsPage } from "@/pages/org-settings/general";

const searchSchema = z.object({
	denied: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/_auth/orgs/$orgId/settings/")({
	validateSearch: searchSchema,
	component: () => {
		const { orgId } = Route.useParams();
		const { denied } = Route.useSearch();
		return <GeneralSettingsPage orgId={orgId} denied={denied} />;
	},
});
