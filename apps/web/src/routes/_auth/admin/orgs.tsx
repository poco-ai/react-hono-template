import { createFileRoute } from "@tanstack/react-router";
import { adminOrgsSearchSchema } from "@/features/admin/search";
import { AdminOrgsPage } from "@/pages/admin-orgs";

export const Route = createFileRoute("/_auth/admin/orgs")({
	validateSearch: adminOrgsSearchSchema,
	component: AdminOrgsPage,
});
