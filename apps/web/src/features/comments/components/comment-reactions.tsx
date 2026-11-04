import type { CommentReactionSummaryDto } from "@api/dto/comment.dto";
import type { CommentReactionEmoji } from "@workspace/shared";
import { COMMENT_REACTION_EMOJIS } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";
import { SmilePlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Reaction summary + emoji picker for a single comment. The emoji whitelist is
 * shared with the API so unknown emoji can never be requested.
 */
export function CommentReactions({
	reactions,
	disabled,
	onToggle,
}: {
	reactions: CommentReactionSummaryDto[];
	disabled?: boolean;
	onToggle: (emoji: CommentReactionEmoji) => void;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	return (
		<div className="mt-2 flex flex-wrap items-center gap-1">
			{reactions.map((reaction) => (
				<Button
					key={reaction.emoji}
					type="button"
					variant={reaction.mine ? "secondary" : "ghost"}
					size="xs"
					aria-pressed={reaction.mine}
					aria-label={t("comments.reactionToggle", {
						emoji: reaction.emoji,
						count: reaction.count,
					})}
					disabled={disabled}
					className={cn(
						"rounded-full border px-1.5",
						reaction.mine ? "border-primary/40" : "border-transparent",
					)}
					onClick={() => onToggle(reaction.emoji as CommentReactionEmoji)}
				>
					<span aria-hidden>{reaction.emoji}</span>
					<span className="text-xs tabular-nums">{reaction.count}</span>
				</Button>
			))}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					render={
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label={t("comments.addReaction")}
							disabled={disabled}
							className="text-muted-foreground"
						/>
					}
				>
					<SmilePlus />
				</PopoverTrigger>
				<PopoverContent align="start" className="w-auto gap-1 p-1">
					<div className="flex items-center gap-0.5">
						{COMMENT_REACTION_EMOJIS.map((emoji) => (
							<Button
								key={emoji}
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={t("comments.reactionToggle", { emoji, count: 0 })}
								onClick={() => {
									setOpen(false);
									onToggle(emoji);
								}}
							>
								<span aria-hidden className="text-base">
									{emoji}
								</span>
							</Button>
						))}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
