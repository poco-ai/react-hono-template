// biome-ignore-all lint/suspicious/noArrayIndexKey: UI message parts are an ordered stream and carry no per-part id.
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble";
import { Message, MessageContent } from "@workspace/ui/components/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@workspace/ui/components/message-scroller";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
import {
	getToolName,
	isDynamicToolUIPart,
	isTextUIPart,
	isToolUIPart,
	type UIMessage,
} from "ai";
import { ArrowDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MarkdownContent } from "@/components/markdown";
import { ApprovalCard } from "@/features/ai/components/approval-card";
import { ToolCard } from "@/features/ai/components/tool-card";

export function AiMessageList({
	messages,
	streaming,
	className,
}: {
	messages: UIMessage[];
	streaming: boolean;
	className?: string;
}) {
	const { t } = useTranslation();

	return (
		<MessageScrollerProvider autoScroll>
			<MessageScroller className={cn("min-h-0 flex-1", className)}>
				<MessageScrollerViewport aria-label={t("ai.messagesLabel")}>
					<MessageScrollerContent className="px-4 py-5">
						{messages.map((message, messageIndex) => (
							<MessageScrollerItem
								key={message.id}
								messageId={message.id}
								scrollAnchor={messageIndex === messages.length - 1}
							>
								<Message align={message.role === "user" ? "end" : "start"}>
									<MessageContent>
										{message.parts.map((part, partIndex) => {
											if (isTextUIPart(part)) {
												if (!part.text) {
													return null;
												}
												if (message.role === "user") {
													return (
														<Bubble
															key={`${message.id}-${partIndex}`}
															align="end"
															variant="secondary"
														>
															<BubbleContent className="whitespace-pre-wrap">
																{part.text}
															</BubbleContent>
														</Bubble>
													);
												}
												return (
													<div
														key={`${message.id}-${partIndex}`}
														className="min-w-0"
													>
														<MarkdownContent>{part.text}</MarkdownContent>
													</div>
												);
											}

											if (!isToolUIPart(part) && !isDynamicToolUIPart(part)) {
												return null;
											}

											if (part.state === "approval-requested") {
												return (
													<ApprovalCard
														key={`${message.id}-${partIndex}`}
														approvalId={part.approval.id}
														toolName={getToolName(part)}
														input={"input" in part ? part.input : undefined}
													/>
												);
											}

											return (
												<ToolCard
													key={`${message.id}-${partIndex}`}
													part={part}
												/>
											);
										})}
									</MessageContent>
								</Message>
							</MessageScrollerItem>
						))}
						{streaming ? (
							<div
								aria-live="polite"
								className="text-muted-foreground flex items-center gap-2 px-1 text-xs"
							>
								<Spinner className="size-3" />
								<span>{t("ai.thinking")}</span>
							</div>
						) : null}
					</MessageScrollerContent>
				</MessageScrollerViewport>
				<MessageScrollerButton className="bottom-3">
					<ArrowDown />
					<span className="sr-only">{t("ai.scrollToEnd")}</span>
				</MessageScrollerButton>
			</MessageScroller>
		</MessageScrollerProvider>
	);
}
