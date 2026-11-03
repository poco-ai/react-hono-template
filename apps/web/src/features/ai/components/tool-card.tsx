import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import {
	Trace,
	TraceCollapsible,
	TraceCollapsibleContent,
	TraceCollapsibleTrigger,
	TraceDescription,
	TraceIcon,
	TraceLine,
	TraceTitle,
} from "@workspace/ui/components/trace";
import { type DynamicToolUIPart, getToolName, type ToolUIPart } from "ai";
import {
	Ban,
	CheckCircle2,
	type LucideIcon,
	Wrench,
	XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
	type AiToolEffect,
	aiLinkLabelKey,
	aiToolEffect,
	aiToolTitleKey,
} from "@/features/ai/data";
import type { TranslationKey } from "@/lib/errors";

export type AiToolPart = ToolUIPart | DynamicToolUIPart;

const TOOL_STATE_KEYS: Record<string, TranslationKey> = {
	"input-streaming": "ai.tools.states.input-streaming",
	"input-available": "ai.tools.states.input-available",
	"approval-requested": "ai.tools.states.approval-requested",
	"approval-responded": "ai.tools.states.approval-responded",
	"output-available": "ai.tools.states.output-available",
	"output-error": "ai.tools.states.output-error",
	"output-denied": "ai.tools.states.output-denied",
};

const EFFECT_KEYS: Record<AiToolEffect, TranslationKey> = {
	read: "ai.tools.effects.read",
	write: "ai.tools.effects.write",
	destructive: "ai.tools.effects.destructive",
};

const RUNNING_STATES = new Set(["input-streaming", "input-available"]);

type ToolLink = { labelKey: string; url: string };

type ToolOutputShape = {
	summary?: string;
	data?: unknown;
	links: ToolLink[];
};

const isToolLink = (value: unknown): value is ToolLink =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as { labelKey?: unknown }).labelKey === "string" &&
	typeof (value as { url?: unknown }).url === "string";

export function toolOutputShape(output: unknown): ToolOutputShape | null {
	if (typeof output !== "object" || output === null) {
		return null;
	}
	const record = output as Record<string, unknown>;
	return {
		summary: typeof record.summary === "string" ? record.summary : undefined,
		data: record.data,
		links: Array.isArray(record.links) ? record.links.filter(isToolLink) : [],
	};
}

function stringifyJson(value: unknown): string {
	try {
		const json = JSON.stringify(value, null, 2);
		return json.length > 4000 ? `${json.slice(0, 4000)}…` : json;
	} catch {
		return "";
	}
}

function toolIcon(state: string): LucideIcon | null {
	if (RUNNING_STATES.has(state)) {
		return null;
	}
	if (state === "output-error") {
		return XCircle;
	}
	if (state === "output-denied") {
		return Ban;
	}
	if (state === "output-available") {
		return CheckCircle2;
	}
	return Wrench;
}

/** Compact, expandable card for a tool invocation part. */
export function ToolCard({ part }: { part: AiToolPart }) {
	const { t } = useTranslation();
	const toolName = getToolName(part);
	const titleKey = aiToolTitleKey(toolName);
	const title = titleKey ? t(titleKey) : toolName;
	const effect = aiToolEffect(toolName);
	const state = part.state;
	const stateKey = TOOL_STATE_KEYS[state];
	const Icon = toolIcon(state);
	const output =
		state === "output-available" ? toolOutputShape(part.output) : null;
	const input = "input" in part ? part.input : undefined;
	const inputJson = stringifyJson(input);
	const outputJson =
		output && output.data !== undefined ? stringifyJson(output.data) : "";

	return (
		<Trace className="max-w-full">
			<TraceCollapsible>
				<TraceCollapsibleTrigger>
					<TraceLine
						status={
							RUNNING_STATES.has(state)
								? "running"
								: state === "output-error" || state === "output-denied"
									? "error"
									: state === "approval-requested"
										? "pending"
										: undefined
						}
					>
						<TraceIcon>
							{Icon ? <Icon /> : <Spinner className="size-3.5" />}
						</TraceIcon>
						<TraceTitle>{title}</TraceTitle>
						<Badge
							variant={
								effect === "destructive"
									? "destructive"
									: effect === "write"
										? "secondary"
										: "outline"
							}
							className="shrink-0"
						>
							{t(EFFECT_KEYS[effect])}
						</Badge>
						{stateKey ? (
							<TraceDescription>{t(stateKey)}</TraceDescription>
						) : null}
					</TraceLine>
				</TraceCollapsibleTrigger>
				<TraceCollapsibleContent>
					<div className="flex flex-col gap-3">
						{output?.summary ? (
							<p className="text-foreground/80">{output.summary}</p>
						) : null}
						{inputJson ? (
							<div className="flex flex-col gap-1">
								<span className="text-xs font-medium">
									{t("ai.tools.input")}
								</span>
								<pre className="bg-muted/60 max-h-56 overflow-auto rounded-md p-2 font-mono text-xs">
									{inputJson}
								</pre>
							</div>
						) : null}
						{outputJson ? (
							<div className="flex flex-col gap-1">
								<span className="text-xs font-medium">
									{t("ai.tools.output")}
								</span>
								<pre className="bg-muted/60 max-h-56 overflow-auto rounded-md p-2 font-mono text-xs">
									{outputJson}
								</pre>
							</div>
						) : null}
						{output && output.links.length > 0 ? (
							<div className="flex flex-wrap items-center gap-2">
								<span className="text-xs font-medium">
									{t("ai.tools.links")}
								</span>
								{output.links.map((link) => {
									const labelKey = aiLinkLabelKey(link.labelKey);
									return (
										<a
											key={`${link.labelKey}-${link.url}`}
											href={link.url}
											target="_blank"
											rel="noreferrer"
											className={buttonVariants({
												variant: "outline",
												size: "xs",
											})}
										>
											{labelKey ? t(labelKey) : t("ai.tools.details")}
										</a>
									);
								})}
							</div>
						) : null}
					</div>
				</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}
