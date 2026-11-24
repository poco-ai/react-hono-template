import type { AiConversationDto } from "@api/features/ai/dto/ai.dto";
import { Link } from "@tanstack/react-router";
import {
	SidebarMenuButton,
	SidebarMenuItem,
} from "@workspace/ui/components/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { useTranslation } from "react-i18next";
import { ACTIVE_ITEM_CLASS } from "./org-sidebar-item-class";

export function ConversationRow({
	orgId,
	conversation,
	indented = false,
	onNavigate,
}: {
	orgId: string;
	conversation: AiConversationDto;
	indented?: boolean;
	onNavigate?: () => void;
}) {
	const { t } = useTranslation();
	const title = conversation.title || t("ai.untitled");
	return (
		<SidebarMenuItem>
			<Tooltip>
				<TooltipTrigger
					render={
						<SidebarMenuButton
							className={indented ? "pl-14" : "pl-8"}
							render={
								<Link
									to="/orgs/$orgId/ai/$conversationId"
									params={{ orgId, conversationId: conversation.id }}
									onClick={onNavigate}
									activeProps={{ className: ACTIVE_ITEM_CLASS }}
								/>
							}
						>
							<span className="min-w-0 truncate">{title}</span>
						</SidebarMenuButton>
					}
				/>
				<TooltipContent>{title}</TooltipContent>
			</Tooltip>
		</SidebarMenuItem>
	);
}
