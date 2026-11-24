import { useNavigate, useParams } from "@tanstack/react-router";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import { Spinner } from "@workspace/ui/components/spinner";
import { Info, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAiChat } from "@/features/ai/chat-provider";
import { AiChatHeader } from "@/features/ai/components/ai-chat-header";
import { AiChatSidebar } from "@/features/ai/components/ai-chat-sidebar";
import { AiErrorAlert } from "@/features/ai/components/ai-error-alert";
import {
	AiChatEmpty,
	AiUnavailable,
} from "@/features/ai/components/chat-empty";
import { AiComposer } from "@/features/ai/components/composer";
import { AiConversationList } from "@/features/ai/components/conversation-list";
import { AiMessageList } from "@/features/ai/components/message-list";
import { useDocumentTitle } from "@/lib/use-document-title";

/**
 * Full-page AI chat. Rendered for both `/ai` (new conversation) and
 * `/ai/$conversationId`; the provider owns the single stream.
 */
export function AiChatPage({ conversationId }: { conversationId?: string }) {
	const { t } = useTranslation();
	const { orgId } = useParams({ from: "/_auth/orgs/$orgId" });
	const navigate = useNavigate();
	const {
		activeConversationId,
		activeConversation,
		conversationContext,
		conversationLoading,
		setActiveConversation,
		newChat,
		messages,
		streaming,
		error,
		sendPrompt,
		usage,
		availability,
	} = useAiChat();

	const [listOpen, setListOpen] = useState(false);
	const [contextOpen, setContextOpen] = useState(false);
	const routeKeyRef = useRef<string | undefined | null>(null);

	// Route params are the source of truth for which conversation is shown.
	// The ref guard keeps a state update from racing the route transition.
	useEffect(() => {
		if (routeKeyRef.current === conversationId) {
			return;
		}
		routeKeyRef.current = conversationId;
		if (conversationId) {
			if (conversationId !== activeConversationId) {
				setActiveConversation(conversationId);
			}
		} else {
			newChat();
		}
	}, [conversationId, activeConversationId, setActiveConversation, newChat]);

	const shownConversation =
		activeConversation && activeConversation.id === conversationId
			? activeConversation
			: null;

	useDocumentTitle(shownConversation?.title ?? t("ai.title"));

	const selectConversation = (id: string) => {
		setListOpen(false);
		void navigate({
			to: "/orgs/$orgId/ai/$conversationId",
			params: { orgId, conversationId: id },
		});
	};

	const startNewChat = () => {
		newChat();
		setListOpen(false);
		void navigate({ to: "/orgs/$orgId/ai", params: { orgId } });
	};

	const handlePrompt = (prompt: string) => {
		void (async () => {
			const id = await sendPrompt(prompt);
			if (id && id !== conversationId) {
				void navigate({
					to: "/orgs/$orgId/ai/$conversationId",
					params: { orgId, conversationId: id },
				});
			}
		})();
	};

	const unavailable =
		availability === "disabled" || availability === "unconfigured";
	const providerLabel =
		usage.data?.provider.modelId ?? usage.data?.provider.kind ?? null;
	const contextLabel = conversationContext
		? (conversationContext.label ??
			t(
				conversationContext.type === "issue"
					? "ai.context.issue"
					: "ai.context.project",
			))
		: null;

	return (
		<div className="flex h-[calc(100dvh-3rem-3.5rem-env(safe-area-inset-bottom))] min-h-0 w-full overflow-hidden md:h-dvh">
			<aside className="hidden w-64 shrink-0 border-r lg:block">
				<AiConversationList
					className="h-full"
					onSelect={selectConversation}
					onNewChat={startNewChat}
					onDeleted={() =>
						void navigate({ to: "/orgs/$orgId/ai", params: { orgId } })
					}
				/>
			</aside>

			<section className="flex min-w-0 flex-1 flex-col">
				<AiChatHeader
					title={
						activeConversation?.title ??
						(conversationId ? t("ai.untitled") : t("ai.newChatTitle"))
					}
					contextLabel={contextLabel}
					providerLabel={providerLabel}
					onOpenConversations={() => setListOpen(true)}
					onOpenContext={() => setContextOpen(true)}
					onNewChat={startNewChat}
				/>

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
					<AiChatEmpty onPrompt={handlePrompt} />
				) : (
					<AiMessageList messages={messages} streaming={streaming} />
				)}

				{!unavailable ? <AiComposer /> : null}
			</section>

			<aside className="hidden w-72 shrink-0 overflow-y-auto border-l xl:block">
				<AiChatSidebar onPrompt={handlePrompt} />
			</aside>

			<Sheet open={listOpen} onOpenChange={setListOpen}>
				<SheetContent
					side="left"
					className="w-80 max-w-[85vw] gap-0 p-0"
					closeLabel={t("common.close")}
				>
					<SheetHeader className="border-b p-3">
						<SheetTitle className="flex items-center gap-2 text-sm">
							<Sparkles className="size-4" />
							{t("ai.conversations.title")}
						</SheetTitle>
						<SheetDescription className="sr-only">
							{t("ai.conversations.title")}
						</SheetDescription>
					</SheetHeader>
					<AiConversationList
						className="min-h-0 flex-1"
						onSelect={selectConversation}
						onNewChat={startNewChat}
						onDeleted={() =>
							void navigate({ to: "/orgs/$orgId/ai", params: { orgId } })
						}
					/>
				</SheetContent>
			</Sheet>

			<Sheet open={contextOpen} onOpenChange={setContextOpen}>
				<SheetContent
					side="right"
					className="w-80 max-w-[85vw] gap-0 overflow-y-auto p-0"
					closeLabel={t("common.close")}
				>
					<SheetHeader className="border-b p-3">
						<SheetTitle className="flex items-center gap-2 text-sm">
							<Info className="size-4" />
							{t("ai.page.contextTitle")}
						</SheetTitle>
						<SheetDescription className="sr-only">
							{t("ai.page.contextTitle")}
						</SheetDescription>
					</SheetHeader>
					<AiChatSidebar onPrompt={handlePrompt} />
				</SheetContent>
			</Sheet>
		</div>
	);
}
