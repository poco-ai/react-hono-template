import { Star } from "lucide-react";
import type { WebFeatureDecl } from "@/features/web-types";

/** Favorites: sidebar entry + `favorites` strings. */
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
};
