import { useNavigate, useParams } from "@tanstack/react-router";
import { Spinner } from "@workspace/ui/components/spinner";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAiChat } from "@/features/ai/chat-provider";
import { AiChatHeader } from "@/features/ai/components/ai-chat-header";
import { AiErrorAlert } from "@/features/ai/components/ai-error-alert";
import {
	AiChatEmpty,
	AiUnavailable,
} from "@/features/ai/components/chat-empty";
import { AiComposer } from "@/features/ai/components/composer";
import { AiMessageList } from "@/features/ai/components/message-list";
import { useDocumentTitle } from "@/lib/use-document-title";

/**
 * Full-page AI chat. Rendered for both `/ai` (new conversation) and
 * `/ai/$conversationId`; the provider owns the single stream. The header
 * switcher carries the conversation history, so there is no list column.
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
		void navigate({
			to: "/orgs/$orgId/ai/$conversationId",
			params: { orgId, conversationId: id },
		});
	};

	const startNewChat = () => {
		newChat();
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
		<div className="flex h-[calc(100dvh-3rem-3.5rem-env(safe-area-inset-bottom))] min-h-0 w-full flex-col overflow-hidden md:h-dvh">
			<AiChatHeader
				providerLabel={providerLabel}
				onSelect={selectConversation}
				onNewChat={startNewChat}
				onActiveDeleted={() =>
					void navigate({ to: "/orgs/$orgId/ai", params: { orgId } })
				}
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

			{!unavailable ? <AiComposer contextLabel={contextLabel} /> : null}
		</div>
	);
}
