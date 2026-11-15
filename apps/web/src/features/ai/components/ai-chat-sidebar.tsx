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
import type { UIMessage } from "ai";
import { getToolName, isDynamicToolUIPart, isToolUIPart } from "ai";
import { Hash, Wrench } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAiChat } from "@/features/ai/chat-provider";
import { aiToolEffect, aiToolTitleKey } from "@/features/ai/data";
import type { TranslationKey } from "@/lib/errors";

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

/** Context, usage, tool activity and prompt suggestions for the chat page. */
export function AiChatSidebar({
	onPrompt,
}: {
	onPrompt: (prompt: string) => void;
}) {
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
