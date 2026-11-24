import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
	favoritesQuery,
	isFavorited,
	useToggleFavorite,
} from "@/features/favorites/data";
import { apiErrorMessage } from "@/lib/errors";

/**
 * Star state for one entity. Optional features expose this through
 * `issueExtras.useFavorite`; the issue/project pages render the star without
 * importing favorites data.
 */
export function useFavoriteState(
	orgId: string,
	entityType: "issue" | "project",
	entityId: string | undefined,
) {
	const { t } = useTranslation();
	const favorites = useQuery(favoritesQuery(orgId));
	const mutation = useToggleFavorite(orgId, {
		onError: (error) => toast.error(apiErrorMessage(t, error)),
	});
	const favorited =
		entityId !== undefined && isFavorited(favorites.data, entityType, entityId);
	return {
		favorited,
		pending: mutation.isPending,
		toggle: () => {
			if (!entityId) return;
			mutation.mutate({ entityType, entityId, favorited });
		},
	};
}
