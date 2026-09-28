import { createFileRoute } from "@tanstack/react-router";
import { AdminHomePage } from "@/pages/admin-home";

export const Route = createFileRoute("/_auth/admin/")({
	component: AdminHomePage,
});
