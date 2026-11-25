import { useMatchRoute, useNavigate, useParams } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import { Spinner } from "@workspace/ui/components/spinner";
import { Maximize2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAiChat } from "@/features/ai/chat-provider";
import { AiErrorAlert } from "@/features/ai/components/ai-error-alert";
import {
	AiChatEmpty,
	AiUnavailable,
} from "@/features/ai/components/chat-empty";
import { AiComposer } from "@/features/ai/components/composer";
import { AiConversationSwitcher } from "@/features/ai/components/conversation-switcher";
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
		setActiveConversation,
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
				className="w-full max-w-full gap-0 p-0 pb-[env(safe-area-inset-bottom)] data-[side=right]:sm:max-w-lg"
			>
				<SheetHeader className="flex-row items-center gap-1 border-b p-2">
					<SheetTitle className="sr-only">{t("ai.panelTitle")}</SheetTitle>
					<SheetDescription className="sr-only">
						{t("ai.pageDescription")}
					</SheetDescription>
					<AiConversationSwitcher
						onSelect={setActiveConversation}
						onNewChat={newChat}
						onActiveDeleted={newChat}
						triggerClassName="max-w-[calc(100%-4.5rem)]"
					/>
					<div className="ml-auto flex shrink-0 items-center">
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
					</div>
				</SheetHeader>

				<div className="flex min-h-0 flex-1 flex-col">
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

					<AiComposer
						compact
						contextLabel={ambientContextLabel}
						disabled={conversationLoading}
					/>
				</div>
			</SheetContent>
		</Sheet>
	);
}
