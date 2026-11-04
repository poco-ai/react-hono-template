import {
	Command,
	CommandEmpty,
	CommandItem,
	CommandList,
} from "@workspace/ui/components/command";
import { Popover, PopoverContent } from "@workspace/ui/components/popover";
import { Textarea } from "@workspace/ui/components/textarea";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import {
	type ChangeEvent,
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { MarkdownContent } from "@/components/markdown";
import { UserAvatar } from "@/components/user-avatar";
import {
	filterMentionCandidates,
	getMentionContext,
	insertMention,
	type MentionContext,
} from "@/lib/mention";

export type MentionCandidate = {
	id: string;
	name: string;
	email?: string | null;
	image?: string | null;
};

type MarkdownEditorProps = {
	id?: string;
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	disabled?: boolean;
	rows?: number;
	maxLength?: number;
	ariaInvalid?: boolean;
	ariaDescribedBy?: string;
	footer?: ReactNode;
	className?: string;
	resetKey?: number;
	/** Organization members offered after typing `@`. Omit to disable mentions. */
	mentions?: MentionCandidate[];
	/** Bump to move the caret into the editor (e.g. when starting a reply). */
	focusRequest?: number;
};

export function MarkdownEditor({
	id,
	value,
	onChange,
	placeholder,
	disabled,
	rows,
	maxLength,
	ariaInvalid,
	ariaDescribedBy,
	footer,
	className,
	resetKey,
	mentions,
	focusRequest,
}: MarkdownEditorProps) {
	const { t } = useTranslation();
	const [tab, setTab] = useState<"write" | "preview">("write");
	const [mention, setMention] = useState<MentionContext | null>(null);
	const [activeIndex, setActiveIndex] = useState(0);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	// The initial focus request (usually 0) must not steal focus on mount.
	const handledFocusRequest = useRef(focusRequest);

	const candidates = useMemo(
		() =>
			mention && mentions?.length
				? filterMentionCandidates(mentions, mention.query)
				: [],
		[mention, mentions],
	);

	const open = mention !== null && !disabled;
	const activeId =
		candidates[Math.min(activeIndex, candidates.length - 1)]?.id ?? "";

	useEffect(() => {
		if (resetKey !== undefined) {
			setTab("write");
			setMention(null);
		}
	}, [resetKey]);

	// The picker is anchored to the textarea, which is unmounted in preview.
	useEffect(() => {
		if (tab !== "write") {
			setMention(null);
		}
	}, [tab]);

	useEffect(() => {
		if (focusRequest === undefined) {
			return;
		}
		// Only react to a *new* request. Switching tabs or an unconditional
		// `focusRequest={0}` prop must not pull the user out of preview.
		if (handledFocusRequest.current === focusRequest) {
			return;
		}
		handledFocusRequest.current = focusRequest;
		setTab("write");
		const frame = requestAnimationFrame(() => {
			const textarea = textareaRef.current;
			textarea?.focus();
			const end = textarea?.value.length ?? 0;
			textarea?.setSelectionRange(end, end);
		});
		return () => cancelAnimationFrame(frame);
	}, [focusRequest]);

	const syncMention = (textarea: HTMLTextAreaElement) => {
		if (!mentions?.length || disabled) {
			setMention(null);
			return;
		}
		const caret = textarea.selectionStart ?? textarea.value.length;
		const next = getMentionContext(textarea.value, caret);
		setMention((previous) => {
			if (previous === next) {
				return previous;
			}
			if (
				previous &&
				next &&
				previous.start === next.start &&
				previous.end === next.end &&
				previous.query === next.query
			) {
				return previous;
			}
			return next;
		});
	};

	const choose = (candidate: MentionCandidate) => {
		if (!mention) {
			return;
		}
		const next = insertMention(value, mention, candidate);
		onChange(next.value);
		setMention(null);
		requestAnimationFrame(() => {
			const textarea = textareaRef.current;
			textarea?.focus();
			textarea?.setSelectionRange(next.caret, next.caret);
		});
	};

	const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
		const next = event.target.value;
		onChange(next);
		if (!mentions?.length) {
			return;
		}
		const caret = event.target.selectionStart ?? next.length;
		setMention(getMentionContext(next, caret));
		setActiveIndex(0);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		// Never swallow Enter/Tab while the picker is closed.
		if (!open) {
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			setMention(null);
			return;
		}
		if (candidates.length === 0) {
			return;
		}
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveIndex((index) => (index + 1) % candidates.length);
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveIndex(
				(index) => (index - 1 + candidates.length) % candidates.length,
			);
			return;
		}
		if (event.key === "Enter" || event.key === "Tab") {
			event.preventDefault();
			const candidate =
				candidates[Math.min(activeIndex, candidates.length - 1)];
			if (candidate) {
				choose(candidate);
			}
		}
	};

	return (
		<div className={cn("rounded-lg border", className)}>
			<div className="border-b flex items-center gap-1 px-2 pt-1.5">
				<ToggleGroup
					value={[tab]}
					onValueChange={(next) => {
						if (next[0]) setTab(next[0] as "write" | "preview");
					}}
					spacing={0}
					className="pb-1.5"
				>
					<ToggleGroupItem value="write" size="sm">
						{t("common.write")}
					</ToggleGroupItem>
					<ToggleGroupItem value="preview" size="sm">
						{t("common.preview")}
					</ToggleGroupItem>
				</ToggleGroup>
			</div>
			{tab === "write" ? (
				<>
					<Textarea
						ref={textareaRef}
						id={id}
						value={value}
						placeholder={placeholder}
						onChange={handleChange}
						onClick={(event) => syncMention(event.currentTarget)}
						onSelect={(event) => syncMention(event.currentTarget)}
						onKeyUp={(event) => {
							if (
								event.key === "Escape" ||
								event.key === "Enter" ||
								event.key === "Tab" ||
								event.key === "ArrowUp" ||
								event.key === "ArrowDown"
							) {
								return;
							}
							syncMention(event.currentTarget);
						}}
						onKeyDown={handleKeyDown}
						disabled={disabled}
						rows={rows}
						maxLength={maxLength}
						aria-invalid={ariaInvalid ? true : undefined}
						aria-describedby={ariaDescribedBy}
						aria-autocomplete={mentions?.length ? "list" : undefined}
						className="resize-y border-0 focus-visible:ring-0"
					/>
					<p className="text-muted-foreground px-3 pb-2 text-xs">
						{t("markdown.hint")}
					</p>
				</>
			) : (
				<div className="min-h-24 px-3 py-2">
					{value.trim() ? (
						<MarkdownContent>{value}</MarkdownContent>
					) : (
						<p className="text-muted-foreground text-sm">
							{t("comments.previewEmpty")}
						</p>
					)}
				</div>
			)}
			{footer}
			{mentions?.length ? (
				<Popover open={open} onOpenChange={(next) => !next && setMention(null)}>
					<PopoverContent
						anchor={textareaRef.current}
						align="start"
						side="bottom"
						className="w-64 gap-0 p-0"
					>
						<Command
							shouldFilter={false}
							value={activeId}
							onValueChange={(next) => {
								const index = candidates.findIndex((item) => item.id === next);
								if (index >= 0) {
									setActiveIndex(index);
								}
							}}
							className="bg-transparent"
						>
							<CommandList>
								{candidates.map((candidate, index) => (
									<CommandItem
										key={candidate.id}
										value={candidate.id}
										className={cn(index === activeIndex && "bg-muted")}
										onMouseDown={(event) => event.preventDefault()}
										onSelect={() => choose(candidate)}
									>
										<UserAvatar
											name={candidate.name}
											image={candidate.image}
											className="size-5 text-[10px]"
										/>
										<span className="truncate">{candidate.name}</span>
										{candidate.email ? (
											<span className="text-muted-foreground ml-auto truncate text-xs">
												{candidate.email}
											</span>
										) : null}
									</CommandItem>
								))}
								<CommandEmpty>{t("comments.mentionEmpty")}</CommandEmpty>
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
			) : null}
		</div>
	);
}
