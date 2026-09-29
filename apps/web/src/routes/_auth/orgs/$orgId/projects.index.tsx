import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ProjectsPage } from "@/pages/projects";

const searchSchema = z.object({
	archived: z.coerce.boolean().optional().catch(false),
});

export const Route = createFileRoute("/_auth/orgs/$orgId/projects/")({
	validateSearch: searchSchema,
	component: () => {
		const { orgId } = Route.useParams();
		return <ProjectsPage orgId={orgId} />;
	},
});
