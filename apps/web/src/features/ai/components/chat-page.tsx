import { useNavigate, useParams } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "@workspace/ui/components/item";
import { Progress } from "@workspace/ui/components/progress";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import { Spinner } from "@workspace/ui/components/spinner";
import type { UIMessage } from "ai";
import { getToolName, isDynamicToolUIPart, isToolUIPart } from "ai";
import { Hash, Info, PanelLeft, Plus, Sparkles, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAiChat } from "@/features/ai/chat-provider";
import { AiErrorAlert } from "@/features/ai/components/ai-error-alert";
import {
	AiChatEmpty,
	AiUnavailable,
} from "@/features/ai/components/chat-empty";
import { AiComposer } from "@/features/ai/components/composer";
import { AiConversationList } from "@/features/ai/components/conversation-list";
import { AiMessageList } from "@/features/ai/components/message-list";
import { aiToolEffect, aiToolTitleKey } from "@/features/ai/data";
import type { TranslationKey } from "@/lib/errors";
import { useDocumentTitle } from "@/lib/use-document-title";

const TOOL_STATE_KEYS: Record<string, TranslationKey> = {
	"input-streaming": "ai.tools.states.input-streaming",
	"input-available": "ai.tools.states.input-available",
	"approval-requested": "ai.tools.states.approval-requested",
	"approval-responded": "ai.tools.states.approval-responded",
	"output-available": "ai.tools.states.output-available",
	"output-error": "ai.tools.states.output-error",
	"output-denied": "ai.tools.states.output-denied",
};

const EFFECT_KEYS = {
	read: "ai.tools.effects.read",
	write: "ai.tools.effects.write",
	destructive: "ai.tools.effects.destructive",
} as const;

function toolActivity(messages: UIMessage[]) {
	const activity = new Map<
		string,
		{ name: string; state: string | undefined; count: number }
	>();
	for (const message of messages) {
		for (const part of message.parts) {
			if (!isToolUIPart(part) && !isDynamicToolUIPart(part)) {
				continue;
			}
			const name = getToolName(part);
			const existing = activity.get(name);
			if (existing) {
				existing.count += 1;
				existing.state = part.state;
			} else {
				activity.set(name, { name, state: part.state, count: 1 });
			}
		}
	}
	return [...activity.values()];
}

function AiChatSidebar({ onPrompt }: { onPrompt: (prompt: string) => void }) {
	const { t, i18n } = useTranslation();
	const { usage, usagePercent, conversationContext, messages } = useAiChat();
	const numberFormat = useMemo(
		() => new Intl.NumberFormat(i18n.language),
		[i18n.language],
	);
	const activity = useMemo(() => toolActivity(messages), [messages]);

	const contextLabel = conversationContext
		? (conversationContext.label ??
			t(
				conversationContext.type === "issue"
					? "ai.context.issue"
					: "ai.context.project",
			))
		: null;

	const suggestions = [
		{
			key: "ai.suggestions.summarize" as const,
			prompt: "ai.suggestions.summarizePrompt" as const,
		},
		{
			key: "ai.suggestions.myIssues" as const,
			prompt: "ai.suggestions.myIssuesPrompt" as const,
		},
		{
			key: "ai.suggestions.triage" as const,
			prompt: "ai.suggestions.triagePrompt" as const,
		},
	];

	return (
		<div className="flex flex-col gap-3 p-3">
			<Card size="sm">
				<CardHeader>
					<CardTitle className="text-sm">{t("ai.page.contextTitle")}</CardTitle>
				</CardHeader>
				<CardContent>
					{contextLabel ? (
						<Badge variant="outline" className="max-w-full">
							<Hash />
							<span className="truncate">{contextLabel}</span>
						</Badge>
					) : (
						<p className="text-muted-foreground text-xs">
							{t("ai.page.noContext")}
						</p>
					)}
				</CardContent>
			</Card>

			<Card size="sm">
				<CardHeader>
					<CardTitle className="text-sm">{t("ai.usage.title")}</CardTitle>
					<CardDescription>{t("ai.usage.month")}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<div className="flex items-center justify-between gap-2 text-xs">
						<span className="text-muted-foreground">
							{t("ai.usage.tokens")}
						</span>
						<span className="font-medium tabular-nums">
							{usage.data
								? t("ai.usage.ofLimit", {
										used: numberFormat.format(usage.data.totalTokens),
										limit: numberFormat.format(usage.data.limits.monthlyTokens),
									})
								: "—"}
						</span>
					</div>
					<Progress value={usagePercent} aria-label={t("ai.usage.tokens")} />
					<div className="grid grid-cols-2 gap-2 text-xs">
						<div className="flex flex-col gap-0.5">
							<span className="text-muted-foreground">
								{t("ai.usage.requests")}
							</span>
							<span className="font-medium tabular-nums">
								{usage.data ? numberFormat.format(usage.data.requests) : "—"}
							</span>
						</div>
						<div className="flex flex-col gap-0.5">
							<span className="text-muted-foreground">
								{t("ai.usage.toolCalls")}
							</span>
							<span className="font-medium tabular-nums">
								{usage.data ? numberFormat.format(usage.data.toolCalls) : "—"}
							</span>
						</div>
					</div>
					{usage.data ? (
						<p className="text-muted-foreground text-[11px]">
							{t("ai.usage.limits", {
								plan: t(
									usage.data.limits.plan === "pro"
										? "billing.planPro"
										: "billing.planFree",
								),
							})}
						</p>
					) : null}
				</CardContent>
			</Card>

			<Card size="sm">
				<CardHeader>
					<CardTitle className="text-sm">
						{t("ai.page.capabilitiesTitle")}
					</CardTitle>
					<CardDescription>
						{t("ai.page.capabilitiesDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{activity.length === 0 ? (
						<p className="text-muted-foreground text-xs">
							{t("ai.tools.empty")}
						</p>
					) : (
						<ItemGroup className="gap-1.5">
							{activity.map((tool) => {
								const titleKey = aiToolTitleKey(tool.name);
								const stateKey = tool.state
									? TOOL_STATE_KEYS[tool.state]
									: undefined;
								const effect = aiToolEffect(tool.name);
								return (
									<Item key={tool.name} size="xs" variant="outline">
										<ItemMedia variant="icon">
											<Wrench />
										</ItemMedia>
										<ItemContent>
											<ItemTitle className="text-xs">
												{titleKey ? t(titleKey) : tool.name}
												{tool.count > 1 ? (
													<span className="text-muted-foreground">
														×{tool.count}
													</span>
												) : null}
											</ItemTitle>
										</ItemContent>
										<ItemActions>
											<Badge
												variant={
													tool.state === "output-error" ||
													tool.state === "output-denied" ||
													effect === "destructive"
														? "destructive"
														: effect === "write"
															? "secondary"
															: "outline"
												}
											>
												{stateKey ? t(stateKey) : t(EFFECT_KEYS[effect])}
											</Badge>
										</ItemActions>
									</Item>
								);
							})}
						</ItemGroup>
					)}
				</CardContent>
			</Card>

			<Card size="sm">
				<CardHeader>
					<CardTitle className="text-sm">
						{t("ai.page.suggestionsTitle")}
					</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-1.5">
					{suggestions.map((suggestion) => (
						<Button
							key={suggestion.key}
							variant="outline"
							size="sm"
							className="h-auto justify-start py-1.5 text-left whitespace-normal"
							onClick={() => onPrompt(t(suggestion.prompt))}
						>
							{t(suggestion.key)}
						</Button>
					))}
				</CardContent>
			</Card>
		</div>
	);
}

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
		<div className="flex h-[calc(100dvh-3rem)] min-h-0 w-full overflow-hidden md:h-dvh">
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
				<header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
					<Button
						variant="ghost"
						size="icon-sm"
						className="lg:hidden"
						aria-label={t("ai.conversations.title")}
						title={t("ai.conversations.title")}
						onClick={() => setListOpen(true)}
					>
						<PanelLeft />
					</Button>
					<div className="min-w-0 flex-1">
						<h1 className="truncate text-sm font-semibold">
							{activeConversation?.title ??
								(conversationId ? t("ai.untitled") : t("ai.newChatTitle"))}
						</h1>
						<p className="text-muted-foreground truncate text-xs">
							{providerLabel ?? t("ai.pageDescription")}
						</p>
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
						onClick={() => setContextOpen(true)}
					>
						<Info />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t("ai.newChat")}
						title={t("ai.newChat")}
						onClick={startNewChat}
					>
						<Plus />
					</Button>
				</header>

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
