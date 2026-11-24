import { Star } from "lucide-react";
import { IssueFavoriteButton } from "@/features/favorites/components/issue-favorite-button";
import {
	ProjectFavoriteButton,
	ProjectFavoriteMenuItem,
} from "@/features/favorites/components/project-favorite-actions";
import { ProjectRowFavorite } from "@/features/favorites/components/project-row-favorite";
import { useFavoriteState } from "@/features/favorites/use-favorite";
import type { WebFeatureDecl } from "@/features/web-types";

/** Favorites: sidebar entry, star actions and `favorites` strings. */
export const favoritesWeb: WebFeatureDecl = {
	id: "favorites",
	i18nNamespaces: ["favorites"],
	nav: () => [
		{
			id: "favorites",
			to: "/orgs/$orgId/favorites",
			exact: true,
			labelKey: "nav.favorites",
			icon: Star,
		},
	],
	issueExtras: {
		useFavorite: (orgId, entityType, entityId) =>
			useFavoriteState(orgId, entityType, entityId),
	},
	projectHeaderActions: [
		{ id: "favorite", order: 10, component: ProjectFavoriteButton },
	],
	projectMenuItems: [
		{ id: "favorite", order: 10, component: ProjectFavoriteMenuItem },
	],
	issueHeaderActions: [
		{ id: "favorite", order: 10, component: IssueFavoriteButton },
	],
	projectRowActions: [
		{ id: "favorite", order: 10, component: ProjectRowFavorite },
	],
};
