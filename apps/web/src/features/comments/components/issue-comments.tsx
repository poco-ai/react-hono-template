import type { AttachmentWithUrlDto } from "@api/dto/attachment.dto";
import type { CommentDto } from "@api/dto/comment.dto";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import {
	ATTACHMENT_CONTENT_TYPES,
	ATTACHMENT_MAX_SIZE,
} from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { MessageSquare, Paperclip, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MutationError } from "@/components/mutation-error";
import {
	attachmentUploadErrorKey,
	resolveContentType,
} from "@/features/attachments/data";
import { useSession } from "@/features/auth/data";
import { billingQuery } from "@/features/billing/data";
import { CommentCard } from "@/features/comments/components/comment-card";
import {
	commentsQuery,
	groupCommentThreads,
	useDeleteComment,
	useDeleteCommentAttachment,
	usePostComment,
	useResolveComment,
	useToggleCommentReaction,
	useUpdateComment,
} from "@/features/comments/data";
import { membersQuery } from "@/features/members/data";

const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.markdown,.zip";

interface SelectedFile {
	id: string;
	file: File;
	error?: string;
}

const COMMENT_MAX_LENGTH = 10000;
/** Stop expanding a deep link after this many pages to bound requests. */
const DEEP_LINK_MAX_PAGES = 6;
const COMMENT_HASH_PREFIX = "comment-";

const commentIdFromHash = (hash: string) => {
	const value = hash.replace(/^#/, "");
	if (!value.startsWith(COMMENT_HASH_PREFIX)) {
		return null;
	}
	const id = value.slice(COMMENT_HASH_PREFIX.length);
	return id.length > 0 ? id : null;
};

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
	const location = useLocation();

	const { data: session } = useSession();
	const members = useQuery(membersQuery(orgId));
	const billing = useQuery(billingQuery(orgId));
	const maxSize = billing.data?.limits.attachmentMaxSize ?? ATTACHMENT_MAX_SIZE;
	const [body, setBody] = useState("");
	const [editorResetKey, setEditorResetKey] = useState(0);
	const [focusRequest, setFocusRequest] = useState(0);
	const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(
		null,
	);
	const [deleting, setDeleting] = useState<CommentDto | null>(null);
	const [deletingFile, setDeletingFile] = useState<{
		commentId: string;
		attachment: AttachmentWithUrlDto;
	} | null>(null);
	const [scrollTarget, setScrollTarget] = useState<{
		id: string;
		deepLink: boolean;
	} | null>(null);
	const [highlightedId, setHighlightedId] = useState<string | null>(null);
	const [deepLinkMissing, setDeepLinkMissing] = useState(false);
	const [selected, setSelected] = useState<SelectedFile[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);
	const abortRef = useRef<AbortController | null>(null);

	const currentUserId = session?.user.id;
	const currentRole = members.data?.find(
		(member) => member.userId === currentUserId,
	)?.role;
	const isAdmin = currentRole === "owner" || currentRole === "admin";

	const query = useInfiniteQuery(commentsQuery(orgId, projectId, issueNumber));

	const comments = useMemo(
		() => query.data?.pages.flatMap((page) => page.items) ?? [],
		[query.data],
	);
	const threads = useMemo(() => groupCommentThreads(comments), [comments]);
	const total = query.data?.pages[0]?.total ?? 0;

	const mentionCandidates = useMemo(
		() =>
			(members.data ?? []).map((member) => ({
				id: member.user.id,
				name: member.user.name,
				email: member.user.email,
				image: member.user.image,
			})),
		[members.data],
	);

	const {
		fetchNextPage,
		hasNextPage,
		isFetching: commentsFetching,
		isFetchNextPageError,
		isFetchingNextPage,
		isPending: commentsPending,
	} = query;
	const loadedPages = query.data?.pages.length ?? 0;

	// Deep links from notifications (`#comment-<id>`) and freshly posted
	// comments share this target. Both may live on a page that is not loaded yet.
	useEffect(() => {
		const id = commentIdFromHash(location.hash);
		if (!id) {
			setDeepLinkMissing(false);
			return;
		}
		setDeepLinkMissing(false);
		setScrollTarget({ id, deepLink: true });
	}, [location.hash]);

	useEffect(() => {
		if (!scrollTarget) {
			return;
		}
		const element = comments.some((comment) => comment.id === scrollTarget.id)
			? document.getElementById(`comment-${scrollTarget.id}`)
			: null;
		if (element) {
			element.scrollIntoView({ block: "center" });
			setHighlightedId(scrollTarget.id);
			setDeepLinkMissing(false);
			setScrollTarget(null);
			return;
		}
		const canLoadMore =
			Boolean(hasNextPage) && loadedPages < DEEP_LINK_MAX_PAGES;
		// A posted comment is only visible after the invalidation refetch; wait
		// for it instead of racing the fetched pages.
		if (
			canLoadMore &&
			!isFetchingNextPage &&
			!isFetchNextPageError &&
			(scrollTarget.deepLink || !commentsFetching)
		) {
			void fetchNextPage();
			return;
		}
		if (!commentsPending && !isFetchingNextPage && !commentsFetching) {
			if (scrollTarget.deepLink) {
				setDeepLinkMissing(true);
			} else {
				setScrollTarget(null);
			}
		}
	}, [
		scrollTarget,
		comments,
		commentsFetching,
		commentsPending,
		fetchNextPage,
		hasNextPage,
		isFetchNextPageError,
		isFetchingNextPage,
		loadedPages,
	]);

	// Brief highlight so the jump target is easy to spot.
	useEffect(() => {
		if (!highlightedId) {
			return;
		}
		const timer = window.setTimeout(() => setHighlightedId(null), 2200);
		return () => window.clearTimeout(timer);
	}, [highlightedId]);

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
			setReplyTo(null);
			setEditorResetKey((key) => key + 1);
			// The refetched pages contain the new comment; the shared scroll
			// target finds it (loading more pages if necessary) without a timer.
			setDeepLinkMissing(false);
			setScrollTarget({ id: result.comment.id, deepLink: false });
		},
	});

	useEffect(() => {
		return () => abortRef.current?.abort();
	}, []);

	const updateMutation = useUpdateComment(orgId, projectId, issueNumber);
	const resolveMutation = useResolveComment(orgId, projectId, issueNumber, {
		onSuccess: (_comment, input) => {
			toast.success(
				input.resolved
					? t("toast.commentResolved")
					: t("toast.commentReopened"),
			);
		},
	});
	const reactionMutation = useToggleCommentReaction(
		orgId,
		projectId,
		issueNumber,
		{
			onError: () => toast.error(t("toast.reactionFailed")),
		},
	);

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

	const startReply = (comment: CommentDto) => {
		setReplyTo({ id: comment.id, name: comment.author.name });
		setFocusRequest((value) => value + 1);
	};

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

	const renderingComments = (
		comment: CommentDto,
		options?: { orphan?: boolean },
	) => {
		return (
			<CommentCard
				key={comment.id}
				comment={comment}
				own={currentUserId === comment.author.id}
				isAdmin={isAdmin}
				currentUserId={currentUserId}
				frozen={frozen}
				orphan={options?.orphan}
				highlighted={highlightedId === comment.id}
				resolving={
					resolveMutation.isPending &&
					resolveMutation.variables?.commentId === comment.id
				}
				onReply={startReply}
				onResolve={(target, resolved) =>
					resolveMutation.mutate({ commentId: target.id, resolved })
				}
				onDelete={setDeleting}
				onSave={(target, nextBody) =>
					updateMutation.mutateAsync({ commentId: target.id, body: nextBody })
				}
				onToggleReaction={(target, emoji) =>
					reactionMutation.mutate({ commentId: target.id, emoji })
				}
				onDeleteAttachment={(target, attachment) =>
					setDeletingFile({ commentId: target.id, attachment })
				}
			/>
		);
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
				<div className="flex flex-col gap-3">
					<div className="flex gap-3">
						<Skeleton className="size-6 rounded-full" />
						<div className="flex flex-1 flex-col gap-2">
							<Skeleton className="h-3 w-32" />
							<Skeleton className="h-3 w-3/4" />
						</div>
					</div>
				</div>
			)}
			{query.isError && <MutationError error={query.error} />}

			{!query.isPending && comments.length === 0 && !query.isError && (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<MessageSquare />
						</EmptyMedia>
						<EmptyTitle>{t("comments.title")}</EmptyTitle>
						<EmptyDescription>{t("comments.empty")}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}

			<ul className="flex flex-col gap-5">
				{threads.map((thread) => (
					<li key={thread.comment.id} className="flex flex-col gap-3">
						{renderingComments(thread.comment, { orphan: thread.orphan })}
						{!thread.orphan && thread.replies.length > 0 && (
							<ul className="ml-4 flex flex-col gap-4 border-l pl-4">
								{thread.replies.map((reply) => (
									<li key={reply.id}>{renderingComments(reply)}</li>
								))}
							</ul>
						)}
					</li>
				))}
			</ul>

			{deepLinkMissing && (
				<p className="text-muted-foreground text-xs" role="status">
					{t("comments.deepLinkMissing")}
				</p>
			)}

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
			{resolveMutation.isError && (
				<MutationError error={resolveMutation.error} />
			)}

			<MarkdownEditor
				value={body}
				onChange={setBody}
				resetKey={editorResetKey}
				placeholder={
					replyTo
						? t("comments.replyPlaceholder", { name: replyTo.name })
						: t("comments.placeholder")
				}
				disabled={frozen}
				rows={4}
				maxLength={COMMENT_MAX_LENGTH}
				mentions={mentionCandidates}
				focusRequest={focusRequest}
				footer={
					<div className="flex flex-col gap-2 border-t px-3 py-2">
						{replyTo && (
							<div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
								<span className="truncate">
									{t("comments.replyingTo", { name: replyTo.name })}
								</span>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={t("comments.cancelReply")}
									onClick={() => setReplyTo(null)}
								>
									<X />
								</Button>
							</div>
						)}
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
										parentId: replyTo?.id ?? null,
										files: selected
											.filter((item) => !item.error)
											.map((item) => item.file),
										signal: controller.signal,
									});
								}}
							>
								{createMutation.isPending && <Spinner />}
								{replyTo ? t("comments.reply") : t("comments.post")}
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
