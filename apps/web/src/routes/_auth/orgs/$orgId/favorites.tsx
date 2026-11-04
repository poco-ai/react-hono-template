import { createFileRoute } from "@tanstack/react-router";
import { FavoritesPage } from "@/pages/favorites";

export const Route = createFileRoute("/_auth/orgs/$orgId/favorites")({
	component: () => {
		const { orgId } = Route.useParams();
		return <FavoritesPage orgId={orgId} />;
	},
});
