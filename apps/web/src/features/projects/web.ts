import { FolderKanban, PlusIcon } from "lucide-react";
import type { WebFeatureDecl } from "@/features/web-types";

/** Projects: sidebar entry, palette action and mobile tab. */
export const projectsWeb: WebFeatureDecl = {
	id: "projects",
	i18nNamespaces: ["projects"],
	nav: () => [
		{
			id: "projects",
			to: "/orgs/$orgId/projects",
			labelKey: "nav.projects",
			icon: FolderKanban,
			// Collapsed rail keeps the projects shortcut; the full list lives
			// in the sidebar's project section.
			when: ({ collapsed }) => collapsed,
		},
	],
	paletteActions: () => [
		{
			id: "new-project",
			labelKey: "command.newProject",
			icon: PlusIcon,
			run: (ctx) =>
				ctx.navigate({
					to: "/orgs/$orgId/projects",
					params: { orgId: ctx.orgId },
				}),
		},
	],
	mobileTabs: () => [
		{
			id: "projects",
			to: "/orgs/$orgId/projects",
			labelKey: "nav.projects",
			icon: FolderKanban,
		},
	],
};
