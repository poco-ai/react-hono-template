import { useMatchRoute, useNavigate, useParams } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import { Spinner } from "@workspace/ui/components/spinner";
import { Hash, Maximize2, Plus, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAiChat } from "@/features/ai/chat-provider";
import { AiErrorAlert } from "@/features/ai/components/ai-error-alert";
import {
	AiChatEmpty,
	AiUnavailable,
} from "@/features/ai/components/chat-empty";
import { AiComposer } from "@/features/ai/components/composer";
import { AiMessageList } from "@/features/ai/components/message-list";

/** Global right-side AI sheet, mounted once per organization layout. */
export function AiChatPanel() {
	const { t } = useTranslation();
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId" });
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const {
		panelOpen,
		setPanelOpen,
		activeConversationId,
		newChat,
		messages,
		streaming,
		error,
		sendPrompt,
		availability,
		conversationLoading,
		ambientContextLabel,
	} = useAiChat();

	const onAiRoute =
		Boolean(matchRoute({ to: "/orgs/$orgId/ai" })) ||
		Boolean(matchRoute({ to: "/orgs/$orgId/ai/$conversationId" }));

	if (onAiRoute) {
		return null;
	}

	const expand = () => {
		setPanelOpen(false);
		void navigate(
			activeConversationId
				? {
						to: "/orgs/$orgId/ai/$conversationId",
						params: { orgId, conversationId: activeConversationId },
					}
				: { to: "/orgs/$orgId/ai", params: { orgId } },
		);
	};

	const unavailable =
		availability === "disabled" || availability === "unconfigured";

	return (
		<Sheet
			open={panelOpen}
			onOpenChange={setPanelOpen}
			modal={false}
			// Keep the panel open while the page stays interactive; without this a
			// non-modal Base UI dialog closes as soon as focus moves to the content.
			disablePointerDismissal
		>
			<SheetContent
				side="right"
				showCloseButton={false}
				showOverlay={false}
				className="w-full max-w-full gap-0 p-0 sm:max-w-md"
			>
				<SheetHeader className="flex-row items-center gap-1 border-b p-2 pl-3">
					<SheetTitle className="flex min-w-0 flex-1 items-center gap-2 text-sm">
						<Sparkles className="size-4 shrink-0" />
						<span className="truncate">{t("ai.panelTitle")}</span>
					</SheetTitle>
					<SheetDescription className="sr-only">
						{t("ai.pageDescription")}
					</SheetDescription>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t("ai.newChat")}
						title={t("ai.newChat")}
						onClick={newChat}
					>
						<Plus />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t("ai.panel.expand")}
						title={t("ai.panel.expand")}
						onClick={expand}
					>
						<Maximize2 />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t("ai.panel.close")}
						title={t("ai.panel.close")}
						onClick={() => setPanelOpen(false)}
					>
						<X />
					</Button>
				</SheetHeader>

				<div className="flex min-h-0 flex-1 flex-col">
					<div className="flex items-center gap-2 border-b px-3 py-2">
						<Badge
							variant={ambientContextLabel ? "outline" : "ghost"}
							className="max-w-full"
						>
							<Hash />
							<span className="truncate">
								{ambientContextLabel ?? t("ai.context.none")}
							</span>
						</Badge>
					</div>

					{error ? <AiErrorAlert error={error} className="mx-3 mt-3" /> : null}

					{unavailable ? (
						<AiUnavailable
							orgId={orgId}
							reason={availability === "disabled" ? "disabled" : "unconfigured"}
						/>
					) : conversationLoading ? (
						<div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
							<Spinner />
							{t("ai.loadingConversation")}
						</div>
					) : messages.length === 0 && !streaming ? (
						<AiChatEmpty
							compact
							onPrompt={(prompt) => {
								void sendPrompt(prompt);
							}}
						/>
					) : (
						<AiMessageList messages={messages} streaming={streaming} />
					)}

					<AiComposer compact disabled={conversationLoading} />
				</div>
			</SheetContent>
		</Sheet>
	);
}
