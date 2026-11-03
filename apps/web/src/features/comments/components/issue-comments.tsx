import type { AttachmentWithUrlDto } from "@api/dto/attachment.dto";
import type { CommentDto } from "@api/dto/comment.dto";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
	ATTACHMENT_CONTENT_TYPES,
	ATTACHMENT_MAX_SIZE,
} from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { Textarea } from "@workspace/ui/components/textarea";
import { Paperclip, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MarkdownContent } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MutationError } from "@/components/mutation-error";
import { UserAvatar } from "@/components/user-avatar";
import {
	attachmentUploadErrorKey,
	resolveContentType,
} from "@/features/attachments/data";
import { useSession } from "@/features/auth/data";
import { billingQuery } from "@/features/billing/data";
import {
	commentsQuery,
	useDeleteComment,
	useDeleteCommentAttachment,
	usePostComment,
	useUpdateComment,
} from "@/features/comments/data";
import { membersQuery } from "@/features/members/data";
import { formatBytes, formatDateTime, formatRelativeTime } from "@/lib/format";

const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.markdown,.zip";

interface SelectedFile {
	id: string;
	file: File;
	error?: string;
}

const COMMENT_MAX_LENGTH = 10000;

export function IssueComments({
	orgId,
	projectId,
	issueNumber,
	frozen,
}: {
	orgId: string;
	projectId: string;
	issueNumber: number;
	frozen: boolean;
}) {
	const { t } = useTranslation();

	const { data: session } = useSession();
	const members = useQuery(membersQuery(orgId));
	const billing = useQuery(billingQuery(orgId));
	const maxSize = billing.data?.limits.attachmentMaxSize ?? ATTACHMENT_MAX_SIZE;
	const [body, setBody] = useState("");
	const [editorResetKey, setEditorResetKey] = useState(0);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editBody, setEditBody] = useState("");
	const [deleting, setDeleting] = useState<CommentDto | null>(null);
	const [deletingFile, setDeletingFile] = useState<{
		commentId: string;
		attachment: AttachmentWithUrlDto;
	} | null>(null);
	const [selected, setSelected] = useState<SelectedFile[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);
	const abortRef = useRef<AbortController | null>(null);

	const currentRole = members.data?.find(
		(member) => member.userId === session?.user.id,
	)?.role;
	const isAdmin = currentRole === "owner" || currentRole === "admin";

	const query = useInfiniteQuery(commentsQuery(orgId, projectId, issueNumber));

	const comments = query.data?.pages.flatMap((page) => page.items) ?? [];
	const total = query.data?.pages[0]?.total ?? 0;

	const createMutation = usePostComment(orgId, projectId, issueNumber, {
		onSuccess: (result) => {
			toast.success(t("toast.commentPosted"));
			for (const failed of result.failed) {
				toast.error(
					t(attachmentUploadErrorKey(failed.error), {
						filename: failed.file.name,
					}),
				);
			}
			setBody("");
			setSelected([]);
			setEditorResetKey((key) => key + 1);
		},
	});

	useEffect(() => {
		return () => abortRef.current?.abort();
	}, []);

	const updateMutation = useUpdateComment(orgId, projectId, issueNumber, {
		onSuccess: () => {
			setEditingId(null);
		},
	});

	const deleteMutation = useDeleteComment(orgId, projectId, issueNumber, {
		onSuccess: () => {
			setDeleting(null);
		},
	});
	const deleteFileMutation = useDeleteCommentAttachment(
		orgId,
		projectId,
		issueNumber,
		{
			onSuccess: () => {
				setDeletingFile(null);
			},
		},
	);

	const canSubmit = body.trim().length > 0 && body.length <= COMMENT_MAX_LENGTH;

	const addFiles = (list: FileList | File[]) => {
		const next: SelectedFile[] = [];
		for (const file of Array.from(list)) {
			const contentType = resolveContentType(file);
			let error: string | undefined;
			if (
				!(ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(contentType)
			) {
				error = t("attachments.typeNotAllowed", { filename: file.name });
			} else if (file.size < 1 || file.size > maxSize) {
				error = t("attachments.tooLarge", { filename: file.name });
			}
			next.push({ id: crypto.randomUUID(), file, error });
		}
		setSelected((prev) => [...prev, ...next]);
	};

	return (
		<section className="flex flex-col gap-4">
			<h2 className="flex items-center gap-2 text-sm font-semibold">
				{t("comments.title")}
				<span className="text-muted-foreground font-normal">
					{t("comments.count", { count: total })}
				</span>
			</h2>

			{query.isPending && (
				<p className="text-muted-foreground text-sm">{t("common.loading")}</p>
			)}
			{query.isError && <MutationError error={query.error} />}

			{!query.isPending && comments.length === 0 && !query.isError && (
				<p className="text-muted-foreground text-sm">{t("comments.empty")}</p>
			)}

			<ul className="flex flex-col gap-5">
				{comments.map((comment) => {
					const own = session?.user.id === comment.author.id;
					const editing = editingId === comment.id;
					return (
						<li key={comment.id} className="group/comment flex gap-3">
							<UserAvatar
								name={comment.author.name}
								image={comment.author.image}
								className="mt-0.5 size-6 shrink-0"
							/>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span className="text-sm font-medium">
										{comment.author.name}
									</span>
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
									{own && !editing && (
										<span className="flex items-center gap-1 opacity-0 transition-opacity group-hover/comment:opacity-100 group-focus-within/comment:opacity-100 pointer-coarse:opacity-100 max-sm:opacity-100">
											<Button
												variant="ghost"
												size="icon-sm"
												aria-label={t("common.edit")}
												disabled={frozen}
												onClick={() => {
													setEditingId(comment.id);
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
												onClick={() => setDeleting(comment)}
											>
												<Trash2 />
											</Button>
										</span>
									)}
								</div>
								{editing ? (
									<div className="mt-2 flex flex-col gap-2">
										<Textarea
											value={editBody}
											placeholder={t("comments.placeholder")}
											onChange={(e) => setEditBody(e.target.value)}
											rows={4}
											maxLength={COMMENT_MAX_LENGTH}
										/>
										<div className="flex items-center gap-2">
											<Button
												size="sm"
												disabled={
													frozen ||
													updateMutation.isPending ||
													editBody.trim().length === 0
												}
												onClick={() =>
													updateMutation.mutate({
														commentId: comment.id,
														body: editBody.trim(),
													})
												}
											>
												{updateMutation.isPending && <Spinner />}
												{t("common.save")}
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => setEditingId(null)}
											>
												{t("common.cancel")}
											</Button>
										</div>
									</div>
								) : (
									<div className="mt-1 max-w-3xl">
										<MarkdownContent>{comment.body}</MarkdownContent>
									</div>
								)}
								{comment.attachments.length > 0 && (
									<ul className="mt-2 flex max-w-3xl flex-col gap-1">
										{comment.attachments.map((attachment) => {
											const canDelete =
												isAdmin ||
												own ||
												attachment.uploader?.id === session?.user.id;
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
															onClick={() =>
																setDeletingFile({
																	commentId: comment.id,
																	attachment,
																})
															}
														>
															<Trash2 />
														</Button>
													)}
												</li>
											);
										})}
									</ul>
								)}
							</div>
						</li>
					);
				})}
			</ul>

			{query.hasNextPage && (
				<Button
					variant="outline"
					size="sm"
					className="self-start"
					disabled={query.isFetchingNextPage}
					onClick={() => query.fetchNextPage()}
				>
					{query.isFetchingNextPage && <Spinner />}
					{t("common.loadMore")}
				</Button>
			)}

			{updateMutation.isError && <MutationError error={updateMutation.error} />}

			<MarkdownEditor
				value={body}
				onChange={setBody}
				resetKey={editorResetKey}
				placeholder={t("comments.placeholder")}
				disabled={frozen}
				rows={4}
				maxLength={COMMENT_MAX_LENGTH}
				footer={
					<div className="flex flex-col gap-2 border-t px-3 py-2">
						{selected.length > 0 && (
							<ul className="flex flex-col gap-1">
								{selected.map((item) => (
									<li key={item.id} className="flex items-center gap-2 text-xs">
										<span
											className={
												item.error
													? "text-destructive min-w-0 flex-1 truncate"
													: "min-w-0 flex-1 truncate"
											}
										>
											{item.error ?? item.file.name}
										</span>
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={t("comments.removeFile", {
												filename: item.file.name,
											})}
											onClick={() =>
												setSelected((prev) =>
													prev.filter((file) => file.id !== item.id),
												)
											}
										>
											<X />
										</Button>
									</li>
								))}
							</ul>
						)}
						<div className="flex items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label={t("comments.attach")}
									disabled={frozen || createMutation.isPending}
									onClick={() => inputRef.current?.click()}
								>
									<Paperclip />
								</Button>
								<input
									ref={inputRef}
									type="file"
									multiple
									hidden
									accept={ACCEPT}
									onChange={(event) => {
										if (event.target.files && event.target.files.length > 0) {
											addFiles(event.target.files);
										}
										event.target.value = "";
									}}
								/>
								<span className="text-muted-foreground text-xs">
									{t("comments.charCount", {
										count: body.length,
										max: COMMENT_MAX_LENGTH,
									})}
								</span>
							</div>
							<Button
								size="sm"
								disabled={frozen || !canSubmit || createMutation.isPending}
								onClick={() => {
									const controller = new AbortController();
									abortRef.current = controller;
									createMutation.mutate({
										body: body.trim(),
										files: selected
											.filter((item) => !item.error)
											.map((item) => item.file),
										signal: controller.signal,
									});
								}}
							>
								{createMutation.isPending && <Spinner />}
								{t("comments.post")}
							</Button>
						</div>
					</div>
				}
			/>
			{createMutation.isError && <MutationError error={createMutation.error} />}

			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(open) => !open && setDeleting(null)}
				title={t("comments.deleteTitle")}
				description={t("comments.deleteDescription")}
				confirmLabel={t("common.delete")}
				pending={deleteMutation.isPending}
				onConfirm={() => {
					if (deleting) {
						deleteMutation.mutate(deleting.id);
					}
				}}
			/>
			{deleteMutation.isError && <MutationError error={deleteMutation.error} />}
			<ConfirmDialog
				open={deletingFile !== null}
				onOpenChange={(open) => !open && setDeletingFile(null)}
				title={t("attachments.deleteTitle")}
				description={t("attachments.deleteDescription", {
					filename: deletingFile?.attachment.filename ?? "",
				})}
				confirmLabel={t("common.delete")}
				pending={deleteFileMutation.isPending}
				onConfirm={() => {
					if (deletingFile) {
						deleteFileMutation.mutate({
							commentId: deletingFile.commentId,
							attachmentId: deletingFile.attachment.id,
						});
					}
				}}
			/>
			{deleteFileMutation.isError && (
				<MutationError error={deleteFileMutation.error} />
			)}
		</section>
	);
}
