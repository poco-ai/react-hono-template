import { useNavigate } from "@tanstack/react-router";
import {
	SidebarGroup,
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
 * AI sidebar section (chat entry point + up to three recent conversations).
 *
 * The full history lives in the page header switcher; the workspace sidebar
 * keeps just the quick "new chat" action and a short recent list.
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
		.filter(
			(conversation) =>
				conversation.pinned &&
				!(conversation.contextType === "project" && conversation.contextId),
		)
		.slice(0, 2);
	const recent = items
		.filter(
			(conversation) =>
				!conversation.pinned &&
				!(conversation.contextType === "project" && conversation.contextId),
		)
		.slice(0, 3);
	const rows = [...pinned, ...recent].slice(0, 3);

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
			{!collapsed && rows.length > 0 ? (
				<SidebarMenu>
					{rows.map((conversation) => (
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
