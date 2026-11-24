import { useNavigate } from "@tanstack/react-router";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@workspace/ui/components/sidebar";
import { SquarePen } from "lucide-react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { ConversationRow } from "@/components/org-conversation-row";
import { useAiChat } from "@/features/ai/chat-provider";
import type { OrgSidebarSectionContext } from "@/features/web-types";

/**
 * AI sidebar section (chat entry point + recent/pinned/project conversations).
 *
 * Contributed through `aiWeb.sidebarSections` so the org layout no longer
 * imports the AI feature directly — trimming `ai` from a preset removes the
 * section with the rest of the feature.
 */
export const OrgAiSidebar: ComponentType<OrgSidebarSectionContext> = ({
	orgId,
	collapsed,
	onNavigate,
}) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { newChat, conversations } = useAiChat();

	const items = conversations.data?.items ?? [];
	const pinned = items
		.filter((conversation) => conversation.pinned)
		.slice(0, 3);
	const recent = items
		.filter(
			(conversation) =>
				!conversation.pinned &&
				!(conversation.contextType === "project" && conversation.contextId),
		)
		.slice(0, 3);

	const onNewChat = () => {
		newChat();
		void navigate({ to: "/orgs/$orgId/ai", params: { orgId } });
		onNavigate();
	};

	return (
		<SidebarGroup>
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton onClick={onNewChat} tooltip={t("ai.newChat")}>
						<SquarePen />
						<span className="flex-1 text-left">{t("ai.newChat")}</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
			{!collapsed && pinned.length > 0 ? (
				<>
					<SidebarGroupLabel>{t("ai.conversations.pinned")}</SidebarGroupLabel>
					<SidebarMenu>
						{pinned.map((conversation) => (
							<ConversationRow
								key={conversation.id}
								orgId={orgId}
								conversation={conversation}
								onNavigate={onNavigate}
							/>
						))}
					</SidebarMenu>
				</>
			) : null}
			{!collapsed && recent.length > 0 ? (
				<SidebarMenu>
					{recent.map((conversation) => (
						<ConversationRow
							key={conversation.id}
							orgId={orgId}
							conversation={conversation}
							onNavigate={onNavigate}
						/>
					))}
				</SidebarMenu>
			) : null}
		</SidebarGroup>
	);
};
