import { SidebarMenu } from "@workspace/ui/components/sidebar";
import { ConversationRow } from "@/components/org-conversation-row";
import { useAiChat } from "@/features/ai/chat-provider";
import type { WebProjectExtras } from "@/features/web-types";

/**
 * Project-scoped chat rows under a project's sidebar entry.
 *
 * Declared through `aiWeb.projectExtras` so `org-sidebar-projects.tsx` (a
 * projects-feature component) never imports the AI feature directly.
 */
export const ProjectChatExtras: WebProjectExtras = ({
	orgId,
	projectId,
	onNavigate,
}) => {
	const { conversations } = useAiChat();
	const items = conversations.data?.items ?? [];
	const projectConversations = items
		.filter(
			(conversation) =>
				!conversation.pinned &&
				conversation.contextType === "project" &&
				conversation.contextId === projectId,
		)
		.slice(0, 3);

	if (projectConversations.length === 0) return null;

	return (
		<SidebarMenu>
			{projectConversations.map((conversation) => (
				<ConversationRow
					key={conversation.id}
					orgId={orgId}
					conversation={conversation}
					indented
					onNavigate={onNavigate}
				/>
			))}
		</SidebarMenu>
	);
};
