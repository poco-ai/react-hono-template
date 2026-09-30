import { createFileRoute } from "@tanstack/react-router";
import { adminUsersSearchSchema } from "@/features/admin/search";
import { AdminUsersPage } from "@/pages/admin-users";

export const Route = createFileRoute("/_auth/admin/users")({
	validateSearch: adminUsersSearchSchema,
	component: AdminUsersPage,
});
