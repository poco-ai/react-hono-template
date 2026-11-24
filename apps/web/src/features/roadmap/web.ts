import { Map as MapIcon } from "lucide-react";
import type { WebFeatureDecl } from "@/features/web-types";

/** Roadmap: sidebar entry + `roadmap` strings. */
export const roadmapWeb: WebFeatureDecl = {
	id: "roadmap",
	i18nNamespaces: ["roadmap"],
	nav: () => [
		{
			id: "roadmap",
			to: "/orgs/$orgId/roadmap",
			exact: true,
			labelKey: "nav.roadmap",
			icon: MapIcon,
		},
	],
};
