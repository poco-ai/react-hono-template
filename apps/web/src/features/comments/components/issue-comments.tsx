import type { AttachmentWithUrlDto } from "@api/dto/attachment.dto";
import type { CommentDto } from "@api/dto/comment.dto";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ATTACHMENT_MAX_SIZE } from "@workspace/shared";
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
import { MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MutationError } from "@/components/mutation-error";
import { attachmentUploadErrorKey } from "@/features/attachments/data";
import { useSession } from "@/features/auth/data";
import { billingQuery } from "@/features/billing/data";
import { CommentCard } from "@/features/comments/components/comment-card";
import { CommentComposer } from "@/features/comments/components/comment-composer";
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
import { useAttachmentDraft } from "@/features/comments/use-attachment-draft";
import { useCommentDeepLink } from "@/features/comments/use-comment-deep-link";
import { membersQuery } from "@/features/members/data";
import { useOrgRole } from "@/features/organizations/use-org-role";

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
	const [focusRequest, setFocusRequest] = useState(0);
	const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(
		null,
	);
	const [deleting, setDeleting] = useState<CommentDto | null>(null);
	const [deletingFile, setDeletingFile] = useState<{
		commentId: string;
		attachment: AttachmentWithUrlDto;
	} | null>(null);

	const currentUserId = session?.user.id;
	const { canManage: isAdmin } = useOrgRole(orgId);

	const query = useInfiniteQuery(commentsQuery(orgId, projectId, issueNumber));

	const comments = useMemo(
		() => query.data?.pages.flatMap((page) => page.items) ?? [],
		[query.data],
	);
	const threads = useMemo(() => groupCommentThreads(comments), [comments]);
	const total = query.data?.pages[0]?.total ?? 0;

	const { highlightedId, deepLinkMissing, scrollToComment } =
		useCommentDeepLink({ query, comments });
	const draft = useAttachmentDraft({ maxSize });

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
			draft.clear();
			setReplyTo(null);
			setEditorResetKey((key) => key + 1);
			// The refetched pages contain the new comment; the shared scroll
			// target finds it (loading more pages if necessary) without a timer.
			scrollToComment(result.comment.id, false);
		},
	});

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

	const startReply = (comment: CommentDto) => {
		setReplyTo({ id: comment.id, name: comment.author.name });
		setFocusRequest((value) => value + 1);
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

			<CommentComposer
				body={body}
				onBodyChange={setBody}
				replyTo={replyTo}
				onCancelReply={() => setReplyTo(null)}
				mentions={mentionCandidates}
				frozen={frozen}
				submitting={createMutation.isPending}
				resetKey={editorResetKey}
				focusRequest={focusRequest}
				draft={draft}
				onSubmit={() =>
					createMutation.mutate({
						body: body.trim(),
						parentId: replyTo?.id ?? null,
						files: draft.files,
						signal: draft.newSignal(),
					})
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
