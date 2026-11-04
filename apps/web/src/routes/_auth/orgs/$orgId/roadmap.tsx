import { createFileRoute } from "@tanstack/react-router";
import { RoadmapPage } from "@/pages/roadmap";

export const Route = createFileRoute("/_auth/orgs/$orgId/roadmap")({
	component: () => {
		const { orgId } = Route.useParams();
		return <RoadmapPage orgId={orgId} />;
	},
});
