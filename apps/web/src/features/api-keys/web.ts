import { KeyRoundIcon } from "lucide-react";
import { ApiDocsManageKeysLink } from "@/features/api-keys/components/api-docs-manage-keys-link";
import type { WebFeatureDecl } from "@/features/web-types";

/** API keys: settings page + palette shortcut, `apiKeys` strings. */
export const apiKeysWeb: WebFeatureDecl = {
	id: "api-keys",
	i18nNamespaces: ["apiKeys"],
	settingsNav: () => [
		{
			id: "api-keys",
			to: "/orgs/$orgId/settings/api-keys",
			labelKey: "settings.apiKeys",
			requiresManage: true,
		},
	],
	apiDocsAction: ApiDocsManageKeysLink,
	paletteActions: () => [
		{
			id: "settings-api-keys",
			labelKey: "command.settingsApiKeys",
			icon: KeyRoundIcon,
			when: (ctx) => ctx.canManage,
			run: (ctx) =>
				ctx.navigate({
					to: "/orgs/$orgId/settings/api-keys",
					params: { orgId: ctx.orgId },
				}),
		},
	],
};
