import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupTextarea,
} from "@workspace/ui/components/input-group";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowUp, Hash, Square } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAiChat } from "@/features/ai/chat-provider";

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
			className={cn("bg-background border-t p-3", className)}
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			{contextLabel ? (
				<div className="mb-2 flex items-center gap-2">
					<Badge variant="outline" className="max-w-full">
						<Hash />
						<span className="truncate">{contextLabel}</span>
					</Badge>
				</div>
			) : null}
			<InputGroup>
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
					className="justify-between gap-2 border-t px-2 pt-2 pb-1.5 [.border-t]:pt-2"
				>
					<span className="text-muted-foreground hidden text-[11px] sm:inline">
						{t("ai.composerHint")}
					</span>
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
				</InputGroupAddon>
			</InputGroup>
		</form>
	);
}
