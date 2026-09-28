import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AdminOrgsPage } from "@/pages/admin-orgs";

const searchSchema = z.object({
	page: z.coerce.number().int().min(1).optional().catch(1),
	search: z.string().optional().catch(""),
});

export const Route = createFileRoute("/_auth/admin/orgs")({
	validateSearch: searchSchema,
	component: AdminOrgsPage,
});
