import type { WebFeatureDecl } from "@/features/web-types";

/** Project updates own their feed strings; UI lives inside the project page. */
export const projectUpdatesWeb: WebFeatureDecl = {
	id: "project-updates",
	i18nNamespaces: ["projectUpdates"],
};
