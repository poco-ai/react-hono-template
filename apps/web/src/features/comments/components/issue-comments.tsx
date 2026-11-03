import type { CommentDto } from "@api/dto/comment.dto";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { Textarea } from "@workspace/ui/components/textarea";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MarkdownContent } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MutationError } from "@/components/mutation-error";
import { UserAvatar } from "@/components/user-avatar";
import { useSession } from "@/features/auth/data";
import {
	commentsQuery,
	useCreateComment,
	useDeleteComment,
	useUpdateComment,
} from "@/features/comments/data";
import { formatDateTime, formatRelativeTime } from "@/lib/format";

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
	const [body, setBody] = useState("");
	const [editorResetKey, setEditorResetKey] = useState(0);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editBody, setEditBody] = useState("");
	const [deleting, setDeleting] = useState<CommentDto | null>(null);

	const query = useInfiniteQuery(commentsQuery(orgId, projectId, issueNumber));

	const comments = query.data?.pages.flatMap((page) => page.items) ?? [];
	const total = query.data?.pages[0]?.total ?? 0;

	const createMutation = useCreateComment(orgId, projectId, issueNumber, {
		onSuccess: () => {
			toast.success(t("toast.commentPosted"));

			setBody("");
			setEditorResetKey((key) => key + 1);
		},
	});

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

	const canSubmit = body.trim().length > 0 && body.length <= COMMENT_MAX_LENGTH;

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
					<div className="flex items-center justify-between gap-2 border-t px-3 py-2">
						<span className="text-muted-foreground text-xs">
							{t("comments.charCount", {
								count: body.length,
								max: COMMENT_MAX_LENGTH,
							})}
						</span>
						<Button
							size="sm"
							disabled={frozen || !canSubmit || createMutation.isPending}
							onClick={() => createMutation.mutate(body.trim())}
						>
							{createMutation.isPending && <Spinner />}
							{t("comments.post")}
						</Button>
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
		</section>
	);
}
