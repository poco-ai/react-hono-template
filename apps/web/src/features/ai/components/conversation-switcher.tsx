import type { AiConversationDto } from "@api/features/ai/dto/ai.dto";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@workspace/ui/components/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import {
	ChevronDown,
	Pencil,
	Pin,
	PinOff,
	Plus,
	Search,
	Sparkles,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MutationError } from "@/components/mutation-error";
import { useAiChat } from "@/features/ai/chat-provider";
import {
	useDeleteAiConversation,
	useUpdateAiConversation,
} from "@/features/ai/data";
import { formatRelativeTime } from "@/lib/format";

/**
 * Header conversation switcher: the popover carries the full history
 * (search, pinned, recent) so the chat page no longer needs a list column.
 */
export function AiConversationSwitcher({
	onSelect,
	onNewChat,
	onActiveDeleted,
	triggerClassName,
	className,
}: {
	onSelect: (id: string) => void;
	onNewChat: () => void;
	onActiveDeleted?: () => void;
	triggerClassName?: string;
	className?: string;
}) {
	const { t } = useTranslation();
	const { orgId, conversations, activeConversationId, activeConversation } =
		useAiChat();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [renameTarget, setRenameTarget] = useState<AiConversationDto | null>(
		null,
	);
	const [deleteTarget, setDeleteTarget] = useState<AiConversationDto | null>(
		null,
	);
	const [title, setTitle] = useState("");

	const updateMutation = useUpdateAiConversation(orgId, {
		onSuccess: () => {
			toast.success(t("ai.conversations.renamed"));
			setRenameTarget(null);
		},
	});
	const pinMutation = useUpdateAiConversation(orgId, {
		onSuccess: (_data, variables) => {
			toast.success(
				variables.input.pinned
					? t("ai.conversations.pinned")
					: t("ai.conversations.unpinned"),
			);
		},
	});
	const deleteMutation = useDeleteAiConversation(orgId, {
		onSuccess: (_data, id) => {
			toast.success(t("ai.conversations.deleted"));
			setDeleteTarget(null);
			if (id === activeConversationId) {
				onNewChat();
				onActiveDeleted?.();
			}
		},
	});

	const items = conversations.data?.items ?? [];
	const term = search.trim().toLowerCase();
	const filtered = items.filter((conversation) =>
		term
			? (conversation.title ?? t("ai.conversations.untitled"))
					.toLowerCase()
					.includes(term)
			: true,
	);
	const pinned = filtered.filter((conversation) => conversation.pinned);
	const recent = filtered.filter((conversation) => !conversation.pinned);

	const activeTitle = (() => {
		if (!activeConversationId) {
			return t("ai.newChatTitle");
		}
		const item = items.find(
			(conversation) => conversation.id === activeConversationId,
		);
		if (
			activeConversation?.id === activeConversationId &&
			activeConversation.title
		) {
			return activeConversation.title;
		}
		return item?.title ?? t("ai.untitled");
	})();

	const openRename = (conversation: AiConversationDto) => {
		updateMutation.reset();
		setTitle(conversation.title ?? "");
		setRenameTarget(conversation);
	};

	const submitRename = () => {
		if (!renameTarget) {
			return;
		}
		const nextTitle = title.trim();
		if (!nextTitle) {
			return;
		}
		updateMutation.mutate({
			id: renameTarget.id,
			input: { title: nextTitle },
		});
	};

	const togglePin = (conversation: AiConversationDto) => {
		pinMutation.mutate({
			id: conversation.id,
			input: { pinned: !conversation.pinned },
		});
	};

	const conversationTitle = (conversation: AiConversationDto) =>
		conversation.title ?? t("ai.conversations.untitled");

	const renderRow = (conversation: AiConversationDto) => {
		const active = conversation.id === activeConversationId;
		return (
			<div
				key={conversation.id}
				className={cn(
					"group flex items-center gap-0.5 rounded-md pr-1 transition-colors",
					active ? "bg-muted text-foreground" : "hover:bg-muted/60",
				)}
			>
				<Button
					type="button"
					variant="ghost"
					onClick={() => {
						setOpen(false);
						onSelect(conversation.id);
					}}
					aria-current={active ? "page" : undefined}
					// Ghost's hover fill, border and centered column would repaint the
					// row, so neutralize them and keep the row's own geometry.
					className="h-auto min-w-0 flex-1 shrink flex-col items-start justify-start gap-0.5 rounded-md border-0 px-2 py-1.5 text-left font-normal whitespace-normal select-text hover:bg-transparent hover:text-inherit active:not-aria-[haspopup]:translate-y-0 dark:hover:bg-transparent"
				>
					<span className="flex w-full min-w-0 items-center gap-1.5">
						{conversation.pinned ? (
							<Pin className="text-muted-foreground size-3 shrink-0" />
						) : null}
						<span className="truncate text-sm">
							{conversationTitle(conversation)}
						</span>
					</span>
					<span className="text-muted-foreground text-xs">
						{formatRelativeTime(
							conversation.lastMessageAt ?? conversation.createdAt,
						)}
					</span>
				</Button>
				<div className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label={t(
							conversation.pinned
								? "ai.conversations.unpin"
								: "ai.conversations.pin",
						)}
						title={t(
							conversation.pinned
								? "ai.conversations.unpin"
								: "ai.conversations.pin",
						)}
						disabled={pinMutation.isPending}
						onClick={() => togglePin(conversation)}
					>
						{conversation.pinned ? <PinOff /> : <Pin />}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label={t("ai.conversations.rename")}
						title={t("ai.conversations.rename")}
						onClick={() => openRename(conversation)}
					>
						<Pencil />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label={t("ai.conversations.delete")}
						title={t("ai.conversations.delete")}
						onClick={() => {
							deleteMutation.reset();
							setDeleteTarget(conversation);
						}}
					>
						<Trash2 />
					</Button>
				</div>
			</div>
		);
	};

	const groupLabel = (
		key: "ai.conversations.pinned" | "ai.conversations.recent",
	) => (
		<p className="text-muted-foreground px-2 pt-2 pb-1 text-[11px] tracking-wide uppercase">
			{t(key)}
		</p>
	);

	return (
		<>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					render={
						<Button
							type="button"
							variant="outline"
							size="sm"
							aria-label={t("ai.conversations.switchLabel")}
							className={cn(
								"min-w-0 justify-between gap-2 px-2.5 font-normal",
								triggerClassName,
							)}
						/>
					}
				>
					<span className="flex min-w-0 items-center gap-1.5">
						<Sparkles className="text-muted-foreground size-3.5 shrink-0" />
						<span className="truncate">{activeTitle}</span>
					</span>
					<ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
				</PopoverTrigger>
				<PopoverContent
					align="start"
					sideOffset={6}
					className={cn("w-80 max-w-[calc(100vw-2rem)] gap-0 p-0", className)}
				>
					<div className="flex flex-col gap-2 border-b p-2">
						<Button
							type="button"
							variant="secondary"
							className="justify-start"
							onClick={() => {
								setOpen(false);
								onNewChat();
							}}
						>
							<Plus />
							{t("ai.newChat")}
						</Button>
						<InputGroup>
							<InputGroupAddon>
								<Search />
							</InputGroupAddon>
							<InputGroupInput
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder={t("ai.conversations.searchPlaceholder")}
								aria-label={t("ai.conversations.searchPlaceholder")}
							/>
						</InputGroup>
					</div>

					<div className="max-h-[min(60vh,24rem)] min-h-0 flex-1 overflow-y-auto p-1">
						{conversations.isPending ? (
							<div className="flex flex-col gap-2 p-1">
								{["ai-1", "ai-2", "ai-3"].map((key) => (
									<Skeleton key={key} className="h-10 w-full" />
								))}
							</div>
						) : conversations.isError ? (
							<p className="text-muted-foreground p-3 text-sm">
								{t("ai.conversations.loadError")}
							</p>
						) : filtered.length === 0 ? (
							<Empty className="py-8">
								<EmptyHeader>
									<EmptyTitle>
										{term
											? t("ai.conversations.noResults")
											: t("ai.conversations.empty")}
									</EmptyTitle>
									{!term ? (
										<EmptyDescription>
											{t("ai.conversations.emptyDescription")}
										</EmptyDescription>
									) : null}
								</EmptyHeader>
							</Empty>
						) : (
							<>
								{pinned.length > 0 ? (
									<>
										{groupLabel("ai.conversations.pinned")}
										<div className="flex flex-col gap-0.5">
											{pinned.map(renderRow)}
										</div>
									</>
								) : null}
								{recent.length > 0 ? (
									<>
										{groupLabel("ai.conversations.recent")}
										<div className="flex flex-col gap-0.5">
											{recent.map(renderRow)}
										</div>
									</>
								) : null}
							</>
						)}
					</div>
				</PopoverContent>
			</Popover>

			<Dialog
				open={renameTarget !== null}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) {
						setRenameTarget(null);
					}
				}}
			>
				<DialogContent className="sm:max-w-md" closeLabel={t("common.close")}>
					<DialogHeader>
						<DialogTitle>{t("ai.conversations.renameTitle")}</DialogTitle>
						<DialogDescription>
							{t("ai.conversations.renameDescription")}
						</DialogDescription>
					</DialogHeader>
					<form
						className="flex flex-col gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							submitRename();
						}}
					>
						<Field>
							<FieldLabel htmlFor="ai-conversation-title">
								{t("ai.conversations.titleLabel")}
							</FieldLabel>
							<Input
								id="ai-conversation-title"
								value={title}
								maxLength={120}
								onChange={(event) => setTitle(event.target.value)}
							/>
						</Field>
						<MutationError error={updateMutation.error} />
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setRenameTarget(null)}
							>
								{t("common.cancel")}
							</Button>
							<Button
								type="submit"
								disabled={updateMutation.isPending || title.trim().length === 0}
							>
								{t("ai.conversations.save")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={deleteTarget !== null}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) {
						setDeleteTarget(null);
					}
				}}
				title={t("ai.conversations.deleteTitle")}
				description={t("ai.conversations.deleteDescription")}
				confirmLabel={t("ai.conversations.delete")}
				variant="destructive"
				pending={deleteMutation.isPending}
				error={deleteMutation.error}
				onConfirm={() => {
					if (deleteTarget) {
						deleteMutation.mutate(deleteTarget.id);
					}
				}}
			/>
		</>
	);
}
