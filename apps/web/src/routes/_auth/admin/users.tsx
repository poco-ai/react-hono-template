import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AdminUsersPage } from "@/pages/admin-users";

const searchSchema = z.object({
	page: z.coerce.number().int().min(1).optional().catch(1),
	search: z.string().optional().catch(""),
});

export const Route = createFileRoute("/_auth/admin/users")({
	validateSearch: searchSchema,
	component: AdminUsersPage,
});
