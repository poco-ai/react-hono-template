import { WebhookIcon } from "lucide-react";
import type { WebFeatureDecl } from "@/features/web-types";

/** Webhooks: settings page + palette shortcut, `webhooks` strings. */
export const webhooksWeb: WebFeatureDecl = {
	id: "webhooks",
	i18nNamespaces: ["webhooks"],
	settingsNav: () => [
		{
			id: "webhooks",
			to: "/orgs/$orgId/settings/webhooks",
			labelKey: "settings.webhooks",
			requiresManage: true,
		},
	],
	paletteActions: () => [
		{
			id: "settings-webhooks",
			labelKey: "command.settingsWebhooks",
			icon: WebhookIcon,
			when: (ctx) => ctx.canManage,
			run: (ctx) =>
				ctx.navigate({
					to: "/orgs/$orgId/settings/webhooks",
					params: { orgId: ctx.orgId },
				}),
		},
	],
};
