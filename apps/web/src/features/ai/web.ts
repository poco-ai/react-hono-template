import { Sparkles } from "lucide-react";
import { createElement, type ReactNode } from "react";
import { AiChatProvider, useAiChat } from "@/features/ai/chat-provider";
import { AiChatPanelMount } from "@/features/ai/components/org-ai-panel";
import { OrgAiSidebar } from "@/features/ai/components/org-ai-sidebar";
import { ProjectChatExtras } from "@/features/ai/components/project-conversations";
import type { WebFeatureDecl } from "@/features/web-types";

/** AI: chat palette action, settings page, mobile tab, chat provider, `ai` strings. */
export const aiWeb: WebFeatureDecl = {
	id: "ai",
	i18nNamespaces: ["ai"],
	paletteActions: () => [
		{
			id: "ask-ai",
			labelKey: "command.askAi",
			icon: Sparkles,
			run: (ctx) => {
				ctx.setPanelOpen(true);
			},
		},
	],
	settingsNav: () => [
		{
			id: "ai",
			to: "/orgs/$orgId/settings/ai",
			labelKey: "settings.ai",
		},
	],
	mobileTabs: () => [
		{
			id: "ai",
			to: "/orgs/$orgId/ai",
			labelKey: "nav.ai",
			icon: Sparkles,
			exact: false,
		},
	],
	// The shell mounts this around the org layout; dropping the ai feature
	// removes the provider from `webProviders()` and leaves zero wrappers.
	providers: [
		(orgId) =>
			function AiChatProviderScope({ children }: { children: ReactNode }) {
				return createElement(AiChatProvider, { orgId, children });
			},
	],
	// Sidebar chat entry, per-project chat rows and the floating chat panel all
	// travel through the registry so the shell never imports the ai feature.
	sidebarSections: [OrgAiSidebar],
	projectExtras: [ProjectChatExtras],
	panels: [AiChatPanelMount],
	// The `ask-ai` palette action opens the panel through this hook so the
	// palette shell never imports the ai feature.
	palettePanel: {
		useOpen: () => {
			const { setPanelOpen } = useAiChat();
			return () => setPanelOpen(true);
		},
	},
};
