import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Hash, Info, PanelLeft, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Page header of the full-page chat: title, context/provider badges, actions. */
export function AiChatHeader({
	title,
	contextLabel,
	providerLabel,
	onOpenConversations,
	onOpenContext,
	onNewChat,
}: {
	title: string;
	contextLabel: string | null;
	providerLabel: string | null;
	onOpenConversations: () => void;
	onOpenContext: () => void;
	onNewChat: () => void;
}) {
	const { t } = useTranslation();

	return (
		<header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
			<Button
				variant="ghost"
				size="icon-sm"
				className="lg:hidden"
				aria-label={t("ai.conversations.title")}
				title={t("ai.conversations.title")}
				onClick={onOpenConversations}
			>
				<PanelLeft />
			</Button>
			<div className="min-w-0 flex-1">
				<h1 className="truncate text-sm font-semibold">{title}</h1>
			</div>
			{contextLabel ? (
				<Badge variant="outline" className="hidden max-w-48 sm:flex">
					<Hash />
					<span className="truncate">{contextLabel}</span>
				</Badge>
			) : null}
			{providerLabel ? (
				<Badge variant="secondary" className="hidden md:inline-flex">
					{providerLabel}
				</Badge>
			) : null}
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label={t("ai.page.contextTitle")}
				title={t("ai.page.contextTitle")}
				className="xl:hidden"
				onClick={onOpenContext}
			>
				<Info />
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label={t("ai.newChat")}
				title={t("ai.newChat")}
				onClick={onNewChat}
			>
				<Plus />
			</Button>
		</header>
	);
}
