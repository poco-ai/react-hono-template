import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import { cn } from "@workspace/ui/lib/utils";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TranslationKey } from "@/lib/errors";

const SUGGESTIONS: { labelKey: TranslationKey; promptKey: TranslationKey }[] = [
	{
		labelKey: "ai.suggestions.summarize",
		promptKey: "ai.suggestions.summarizePrompt",
	},
	{
		labelKey: "ai.suggestions.myIssues",
		promptKey: "ai.suggestions.myIssuesPrompt",
	},
	{
		labelKey: "ai.suggestions.triage",
		promptKey: "ai.suggestions.triagePrompt",
	},
	{
		labelKey: "ai.suggestions.draftBug",
		promptKey: "ai.suggestions.draftBugPrompt",
	},
];

export function AiChatEmpty({
	onPrompt,
	compact = false,
	className,
}: {
	onPrompt: (prompt: string) => void;
	compact?: boolean;
	className?: string;
}) {
	const { t } = useTranslation();
	const suggestions = compact ? SUGGESTIONS.slice(0, 3) : SUGGESTIONS;

	return (
		<Empty className={cn("min-h-0 flex-1 p-6", className)}>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Sparkles />
				</EmptyMedia>
				<EmptyTitle>{t("ai.emptyTitle")}</EmptyTitle>
				<EmptyDescription>{t("ai.emptyDescription")}</EmptyDescription>
			</EmptyHeader>
			<EmptyContent className="max-w-lg">
				<div className="flex flex-wrap justify-center gap-2">
					{suggestions.map((suggestion) => (
						<Button
							key={suggestion.labelKey}
							type="button"
							variant="outline"
							size="sm"
							className="rounded-full"
							onClick={() => onPrompt(t(suggestion.promptKey))}
						>
							{t(suggestion.labelKey)}
						</Button>
					))}
				</div>
			</EmptyContent>
		</Empty>
	);
}

/** Friendly state when the organization or deployment has AI turned off. */
export function AiUnavailable({
	orgId,
	reason,
	className,
}: {
	orgId: string;
	reason: "disabled" | "unconfigured";
	className?: string;
}) {
	const { t } = useTranslation();

	return (
		<Empty className={cn("min-h-0 flex-1 p-6", className)}>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Sparkles />
				</EmptyMedia>
				<EmptyTitle>
					{t(
						reason === "disabled"
							? "ai.errors.disabled"
							: "ai.errors.notConfigured",
					)}
				</EmptyTitle>
				<EmptyDescription>
					{t(
						reason === "disabled"
							? "ai.errors.disabledDescription"
							: "ai.errors.notConfiguredDescription",
					)}
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Link
					to="/orgs/$orgId/settings"
					params={{ orgId }}
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					{t("ai.errors.openSettings")}
				</Link>
			</EmptyContent>
		</Empty>
	);
}
