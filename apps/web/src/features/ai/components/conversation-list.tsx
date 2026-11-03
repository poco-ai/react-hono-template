import type { AiConversationDto } from "@api/dto/ai.dto";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
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
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import {
	MoreHorizontal,
	Pencil,
	Pin,
	Plus,
	Search,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MutationError } from "@/components/mutation-error";
import { useAiChat } from "@/features/ai/chat-provider";
import {
	useDeleteAiConversation,
	useUpdateAiConversation,
} from "@/features/ai/data";
import { formatRelativeTime } from "@/lib/format";

export function AiConversationList({
	onSelect,
	onNewChat,
	onDeleted,
	className,
}: {
	onSelect: (id: string) => void;
	onNewChat: () => void;
	onDeleted?: (id: string) => void;
	className?: string;
}) {
	const { t } = useTranslation();
	const { orgId, conversations, activeConversationId } = useAiChat();
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
	const deleteMutation = useDeleteAiConversation(orgId, {
		onSuccess: (_data, id) => {
			toast.success(t("ai.conversations.deleted"));
			setDeleteTarget(null);
			if (id === activeConversationId) {
				onNewChat();
				onDeleted?.(id);
			}
		},
	});

	const term = search.trim().toLowerCase();
	const items = (conversations.data?.items ?? []).filter((conversation) =>
		term
			? (conversation.title ?? t("ai.conversations.untitled"))
					.toLowerCase()
					.includes(term)
			: true,
	);

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

	return (
		<div className={cn("flex min-h-0 flex-col", className)}>
			<div className="flex flex-col gap-2 border-b p-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-semibold">
						{t("ai.conversations.title")}
					</h2>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t("ai.newChat")}
						title={t("ai.newChat")}
						onClick={onNewChat}
					>
						<Plus />
					</Button>
				</div>
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

			<div className="min-h-0 flex-1 overflow-y-auto p-2">
				{conversations.isPending ? (
					<div className="flex flex-col gap-2 p-1">
						{["ai-1", "ai-2", "ai-3", "ai-4"].map((key) => (
							<Skeleton key={key} className="h-12 w-full" />
						))}
					</div>
				) : conversations.isError ? (
					<p className="text-muted-foreground p-3 text-sm">
						{t("ai.conversations.loadError")}
					</p>
				) : items.length === 0 ? (
					<Empty className="py-10">
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
					<ul className="flex flex-col gap-1">
						{items.map((conversation) => {
							const active = conversation.id === activeConversationId;
							return (
								<li
									key={conversation.id}
									className={cn(
										"group flex items-center gap-1 rounded-lg transition-colors",
										active ? "bg-muted text-foreground" : "hover:bg-muted/60",
									)}
								>
									<button
										type="button"
										onClick={() => onSelect(conversation.id)}
										aria-current={active ? "page" : undefined}
										className="focus-visible:ring-ring/50 flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left outline-none focus-visible:ring-3"
									>
										<span className="flex w-full min-w-0 items-center gap-1.5">
											{conversation.pinned ? (
												<Pin className="text-muted-foreground size-3 shrink-0" />
											) : null}
											<span className="truncate text-sm font-medium">
												{conversation.title ?? t("ai.conversations.untitled")}
											</span>
										</span>
										<span className="text-muted-foreground text-xs">
											{formatRelativeTime(
												conversation.lastMessageAt ?? conversation.createdAt,
											)}
										</span>
									</button>
									<DropdownMenu>
										<DropdownMenuTrigger
											render={
												<Button
													variant="ghost"
													size="icon-xs"
													className="mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100"
													aria-label={t("ai.conversations.actions")}
												>
													<MoreHorizontal />
												</Button>
											}
										/>
										<DropdownMenuContent align="end" className="w-40">
											<DropdownMenuItem
												onClick={() => openRename(conversation)}
											>
												<Pencil />
												{t("ai.conversations.rename")}
											</DropdownMenuItem>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												variant="destructive"
												onClick={() => {
													deleteMutation.reset();
													setDeleteTarget(conversation);
												}}
											>
												<Trash2 />
												{t("ai.conversations.delete")}
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			<Dialog
				open={renameTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
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

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteTarget(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("ai.conversations.deleteTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("ai.conversations.deleteDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<MutationError error={deleteMutation.error} />
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleteMutation.isPending}
							onClick={() => {
								if (deleteTarget) {
									deleteMutation.mutate(deleteTarget.id);
								}
							}}
						>
							{t("ai.conversations.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
