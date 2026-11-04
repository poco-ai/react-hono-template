import type { AttachmentWithUrlDto } from "@api/dto/attachment.dto";
import type { CommentDto } from "@api/dto/comment.dto";
import type { CommentReactionEmoji } from "@workspace/shared";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import {
	CheckCheck,
	CircleAlert,
	Paperclip,
	Pencil,
	Reply,
	RotateCcw,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownContent } from "@/components/markdown";
import { UserAvatar } from "@/components/user-avatar";
import { CommentReactions } from "@/features/comments/components/comment-reactions";
import { formatBytes, formatDateTime, formatRelativeTime } from "@/lib/format";

const COMMENT_MAX_LENGTH = 10000;

export function CommentCard({
	comment,
	own,
	isAdmin,
	frozen,
	currentUserId,
	resolving,
	orphan = false,
	highlighted = false,
	onReply,
	onResolve,
	onDelete,
	onSave,
	onToggleReaction,
	onDeleteAttachment,
}: {
	comment: CommentDto;
	own: boolean;
	isAdmin: boolean;
	frozen: boolean;
	currentUserId?: string;
	resolving?: boolean;
	/** Reply whose parent is not on the loaded pages (page split or deleted). */
	orphan?: boolean;
	highlighted?: boolean;
	onReply: (comment: CommentDto) => void;
	onResolve: (comment: CommentDto, resolved: boolean) => void;
	onDelete: (comment: CommentDto) => void;
	onSave: (comment: CommentDto, body: string) => Promise<unknown>;
	onToggleReaction: (comment: CommentDto, emoji: CommentReactionEmoji) => void;
	onDeleteAttachment: (
		comment: CommentDto,
		attachment: AttachmentWithUrlDto,
	) => void;
}) {
	const { t } = useTranslation();
	const [editing, setEditing] = useState(false);
	const [editBody, setEditBody] = useState("");
	const [saving, setSaving] = useState(false);
	const resolved = comment.resolvedAt !== null;
	const isReply = comment.parentId !== null;

	const actions = (
		<span className="flex items-center gap-0.5">
			{!isReply && !orphan && (
				<Button
					variant="ghost"
					size="xs"
					className="text-muted-foreground hover:text-foreground"
					disabled={frozen}
					onClick={() => onReply(comment)}
				>
					<Reply />
					{t("comments.reply")}
				</Button>
			)}
			{!isReply && !orphan && (
				<Button
					variant="ghost"
					size="xs"
					className="text-muted-foreground hover:text-foreground"
					disabled={frozen || resolving}
					onClick={() => onResolve(comment, !resolved)}
				>
					{resolving ? <Spinner /> : resolved ? <RotateCcw /> : <CheckCheck />}
					{resolved ? t("comments.reopen") : t("comments.resolve")}
				</Button>
			)}
			{own && !editing && (
				<span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/comment:opacity-100 group-focus-within/comment:opacity-100 pointer-coarse:opacity-100 max-sm:opacity-100">
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t("common.edit")}
						disabled={frozen}
						onClick={() => {
							setEditing(true);
							setEditBody(comment.body);
						}}
					>
						<Pencil />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t("common.delete")}
						className="text-destructive hover:text-destructive"
						disabled={frozen}
						onClick={() => onDelete(comment)}
					>
						<Trash2 />
					</Button>
				</span>
			)}
		</span>
	);

	const submitEdit = async () => {
		const body = editBody.trim();
		if (!body) {
			return;
		}
		setSaving(true);
		try {
			await onSave(comment, body);
			setEditing(false);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			id={`comment-${comment.id}`}
			className={cn(
				"group/comment flex scroll-mt-24 gap-3",
				resolved && "text-muted-foreground",
				orphan && "rounded-lg border border-dashed bg-muted/20 p-3",
				highlighted &&
					"rounded-lg ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
			)}
		>
			<UserAvatar
				name={comment.author.name}
				image={comment.author.image}
				className="mt-0.5 size-6 shrink-0"
			/>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm font-medium">{comment.author.name}</span>
					{orphan && (
						<Badge variant="outline" className="text-muted-foreground">
							<CircleAlert />
							{t("comments.orphanReply")}
						</Badge>
					)}
					{resolved && (
						<Badge
							variant="secondary"
							className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
						>
							<CheckCheck />
							{t("comments.resolved")}
						</Badge>
					)}
					<time
						dateTime={comment.createdAt}
						title={formatDateTime(comment.createdAt)}
						className="text-muted-foreground text-xs"
					>
						{formatRelativeTime(comment.createdAt)}
					</time>
					{comment.updatedAt !== comment.createdAt && (
						<span className="text-muted-foreground text-xs">
							({t("comments.edited")})
						</span>
					)}
					<span className="ml-auto">{actions}</span>
				</div>
				{editing ? (
					<div className="mt-2 flex flex-col gap-2">
						<Textarea
							value={editBody}
							placeholder={t("comments.placeholder")}
							onChange={(event) => setEditBody(event.target.value)}
							rows={4}
							maxLength={COMMENT_MAX_LENGTH}
						/>
						<div className="flex items-center gap-2">
							<Button
								size="sm"
								disabled={frozen || saving || editBody.trim().length === 0}
								onClick={() => void submitEdit()}
							>
								{saving && <Spinner />}
								{t("common.save")}
							</Button>
							<Button
								size="sm"
								variant="ghost"
								disabled={saving}
								onClick={() => setEditing(false)}
							>
								{t("common.cancel")}
							</Button>
						</div>
					</div>
				) : (
					<div className={cn("mt-1 max-w-3xl", resolved && "opacity-80")}>
						<MarkdownContent>{comment.body}</MarkdownContent>
					</div>
				)}
				{comment.attachments.length > 0 && (
					<ul className="mt-2 flex max-w-3xl flex-col gap-1">
						{comment.attachments.map((attachment) => {
							const canDelete =
								isAdmin || own || attachment.uploader?.id === currentUserId;
							return (
								<li
									key={attachment.id}
									className="flex items-center gap-2 text-sm"
								>
									{attachment.contentType.startsWith("image/") &&
									attachment.url ? (
										<img
											src={attachment.url}
											alt={attachment.filename}
											className="size-8 rounded object-cover"
											loading="lazy"
										/>
									) : (
										<Paperclip className="text-muted-foreground size-3.5 shrink-0" />
									)}
									<a
										href={attachment.url ?? undefined}
										target="_blank"
										rel="noreferrer"
										className="min-w-0 truncate hover:underline"
									>
										{attachment.filename}
									</a>
									<span className="text-muted-foreground shrink-0 text-xs">
										{formatBytes(attachment.size)}
									</span>
									{canDelete && (
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={t("common.delete")}
											className="text-destructive hover:text-destructive"
											disabled={frozen}
											onClick={() => onDeleteAttachment(comment, attachment)}
										>
											<Trash2 />
										</Button>
									)}
								</li>
							);
						})}
					</ul>
				)}
				<CommentReactions
					reactions={comment.reactions}
					disabled={frozen}
					onToggle={(emoji) => onToggleReaction(comment, emoji)}
				/>
			</div>
		</div>
	);
}
