import type { WebFeatureDecl } from "@/features/web-types";

/** MCP: OAuth consent + org MCP settings page, `mcp` strings. */
export const mcpWeb: WebFeatureDecl = {
	id: "mcp",
	i18nNamespaces: ["mcp"],
	settingsNav: () => [
		{
			id: "mcp",
			to: "/orgs/$orgId/settings/mcp",
			labelKey: "settings.mcp",
			requiresManage: true,
		},
	],
};
