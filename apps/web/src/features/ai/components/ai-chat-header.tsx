import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AiConversationSwitcher } from "@/features/ai/components/conversation-switcher";

/** Page header: conversation switcher on the left, provider and new chat right. */
export function AiChatHeader({
	providerLabel,
	onSelect,
	onNewChat,
	onActiveDeleted,
}: {
	providerLabel: string | null;
	onSelect: (id: string) => void;
	onNewChat: () => void;
	onActiveDeleted?: () => void;
}) {
	const { t } = useTranslation();

	return (
		<header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
			<AiConversationSwitcher
				onSelect={onSelect}
				onNewChat={onNewChat}
				onActiveDeleted={onActiveDeleted}
				triggerClassName="max-w-[min(24rem,72%)]"
			/>
			<div className="ml-auto flex shrink-0 items-center gap-2">
				{providerLabel ? (
					<Badge variant="outline" className="hidden max-w-40 md:inline-flex">
						<span className="truncate">{providerLabel}</span>
					</Badge>
				) : null}
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={t("ai.newChat")}
					title={t("ai.newChat")}
					onClick={onNewChat}
				>
					<Plus />
				</Button>
			</div>
		</header>
	);
}
