import type { WebFeatureDecl } from "@/features/web-types";

/** Issue templates own the template management page and their strings. */
export const templatesWeb: WebFeatureDecl = {
	id: "templates",
	i18nNamespaces: ["templates"],
	settingsNav: () => [
		{
			id: "templates",
			to: "/orgs/$orgId/settings/templates",
			labelKey: "settings.templates",
		},
	],
};
