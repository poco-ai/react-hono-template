import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupTextarea,
} from "@workspace/ui/components/input-group";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import { Progress } from "@workspace/ui/components/progress";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowUp, Hash, Square } from "lucide-react";
import { type KeyboardEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAiChat } from "@/features/ai/chat-provider";

/** Inline usage meter; details live in a popover instead of a side column. */
function AiUsageMeter() {
	const { t, i18n } = useTranslation();
	const { usage, usagePercent } = useAiChat();
	const numberFormat = useMemo(
		() => new Intl.NumberFormat(i18n.language),
		[i18n.language],
	);
	const data = usage.data;
	const providerLabel = data?.provider.modelId ?? data?.provider.kind ?? null;

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-label={t("ai.usage.title")}
						title={t("ai.usage.title")}
						className="text-muted-foreground h-6 gap-1.5 px-1.5 text-[11px] font-normal tabular-nums"
					/>
				}
			>
				<span
					aria-hidden
					className="bg-muted relative inline-block h-1 w-9 overflow-hidden rounded-full"
				>
					<span
						className="bg-foreground absolute inset-y-0 left-0 rounded-full"
						style={{ width: `${usagePercent}%` }}
					/>
				</span>
				<span>{data ? `${usagePercent}%` : "—"}</span>
			</PopoverTrigger>
			<PopoverContent side="top" align="start" className="w-64 gap-3">
				<PopoverHeader>
					<PopoverTitle>{t("ai.usage.title")}</PopoverTitle>
					<PopoverDescription>{t("ai.usage.month")}</PopoverDescription>
				</PopoverHeader>
				<div className="flex flex-col gap-3">
					<div className="flex items-center justify-between gap-2 text-xs">
						<span className="text-muted-foreground">
							{t("ai.usage.tokens")}
						</span>
						<span className="font-medium tabular-nums">
							{data
								? t("ai.usage.ofLimit", {
										used: numberFormat.format(data.totalTokens),
										limit: numberFormat.format(data.limits.monthlyTokens),
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
								{data ? numberFormat.format(data.requests) : "—"}
							</span>
						</div>
						<div className="flex flex-col gap-0.5">
							<span className="text-muted-foreground">
								{t("ai.usage.toolCalls")}
							</span>
							<span className="font-medium tabular-nums">
								{data ? numberFormat.format(data.toolCalls) : "—"}
							</span>
						</div>
					</div>
					<p className="text-muted-foreground text-[11px]">
						{data
							? [
									t("ai.usage.limits", {
										plan: t(
											data.limits.plan === "pro"
												? "billing.planPro"
												: "billing.planFree",
										),
									}),
									providerLabel,
								]
									.filter(Boolean)
									.join(" · ")
							: "—"}
					</p>
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function AiComposer({
	contextLabel,
	compact = false,
	disabled = false,
	className,
}: {
	contextLabel?: string | null;
	compact?: boolean;
	disabled?: boolean;
	className?: string;
}) {
	const { t } = useTranslation();
	const { sendPrompt, stop, streaming, availability } = useAiChat();
	const [value, setValue] = useState("");

	const unavailable =
		disabled || availability === "disabled" || availability === "unconfigured";
	const canSend = value.trim().length > 0 && !streaming && !unavailable;

	const submit = () => {
		if (!canSend) {
			return;
		}
		const prompt = value;
		setValue("");
		void sendPrompt(prompt);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (
			event.key === "Enter" &&
			!event.shiftKey &&
			!event.nativeEvent.isComposing
		) {
			event.preventDefault();
			submit();
		}
	};

	return (
		<form
			className={cn("border-t bg-background p-3", compact && "p-2", className)}
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<InputGroup
				className={cn("mx-auto w-full", compact ? "max-w-full" : "max-w-3xl")}
			>
				<InputGroupTextarea
					value={value}
					rows={compact ? 2 : 3}
					placeholder={t("ai.composerPlaceholder")}
					aria-label={t("ai.composerPlaceholder")}
					disabled={unavailable}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={onKeyDown}
				/>
				<InputGroupAddon
					align="block-end"
					className="flex-wrap justify-between gap-2 border-t px-2 pt-2 pb-1.5 [.border-t]:pt-2"
				>
					<div className="flex min-w-0 flex-1 items-center gap-2">
						<Badge
							variant={contextLabel ? "outline" : "ghost"}
							className="max-w-[min(18rem,45%)] min-w-0"
						>
							<Hash />
							<span className="truncate">
								{contextLabel ?? t("ai.context.none")}
							</span>
						</Badge>
						<AiUsageMeter />
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{compact ? null : (
							<span className="text-muted-foreground hidden text-[11px] sm:inline">
								{t("ai.composerHint")}
							</span>
						)}
						{streaming ? (
							<Button
								type="button"
								size="icon-sm"
								variant="secondary"
								aria-label={t("ai.stop")}
								title={t("ai.stop")}
								onClick={stop}
							>
								<Square />
							</Button>
						) : (
							<Button
								type="submit"
								size="icon-sm"
								aria-label={t("ai.send")}
								title={t("ai.send")}
								disabled={!canSend}
							>
								<ArrowUp />
							</Button>
						)}
					</div>
				</InputGroupAddon>
			</InputGroup>
		</form>
	);
}
