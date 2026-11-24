import { Activity, ActivityIcon } from "lucide-react";
import type { WebFeatureDecl } from "@/features/web-types";

/** Activity feed: sidebar entry, palette jump target, `activity` strings. */
export const activitiesWeb: WebFeatureDecl = {
	id: "activities",
	i18nNamespaces: ["activity"],
	nav: () => [
		{
			id: "activity",
			to: "/orgs/$orgId/activity",
			exact: true,
			labelKey: "nav.activity",
			icon: Activity,
		},
	],
	paletteActions: () => [
		{
			id: "activity",
			labelKey: "command.goToActivity",
			icon: ActivityIcon,
			run: (ctx) =>
				ctx.navigate({
					to: "/orgs/$orgId/activity",
					params: { orgId: ctx.orgId },
				}),
		},
	],
};
