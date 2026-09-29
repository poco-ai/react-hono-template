import type { CommentDto } from "@api/dto/comment.dto";
import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
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
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { CircleAlert, Loader2, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MarkdownContent } from "@/components/markdown";
import { UserAvatar } from "@/components/user-avatar";
import { client, unwrap } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { formatDateTime, formatRelativeTime } from "@/lib/issue-utils";
import {
	issueActivitiesKey,
	orgActivitiesRootKey,
} from "@/lib/queries/activities";
import { commentsQueryKey, fetchCommentsPage } from "@/lib/queries/comments";
import { useSession } from "@/lib/session";

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
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const [body, setBody] = useState("");
	const [tab, setTab] = useState<"write" | "preview">("write");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editBody, setEditBody] = useState("");
	const [deleting, setDeleting] = useState<CommentDto | null>(null);

	const query = useInfiniteQuery({
		queryKey: commentsQueryKey(orgId, projectId, issueNumber),
		queryFn: ({ pageParam }) =>
			fetchCommentsPage(orgId, projectId, issueNumber, pageParam),
		initialPageParam: 1,
		getNextPageParam: (lastPage) => {
			const totalPages = Math.max(
				1,
				Math.ceil(lastPage.total / lastPage.pageSize),
			);
			return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
		},
	});

	const comments = query.data?.pages.flatMap((page) => page.items) ?? [];
	const total = query.data?.pages[0]?.total ?? 0;

	const invalidate = () => {
		queryClient.invalidateQueries({
			queryKey: commentsQueryKey(orgId, projectId, issueNumber),
		});
		queryClient.invalidateQueries({
			queryKey: issueActivitiesKey(orgId, projectId, issueNumber),
		});
		queryClient.invalidateQueries({
			queryKey: orgActivitiesRootKey(orgId),
		});
	};

	const createMutation = useMutation({
		mutationFn: (input: string) =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[
					":number"
				].comments.$post({
					param: { orgId, projectId, number: String(issueNumber) },
					json: { body: input },
				}),
			),
		onSuccess: () => {
			toast.success(t("toast.commentPosted"));
			invalidate();
			setBody("");
			setTab("write");
		},
	});

	const updateMutation = useMutation({
		mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[
					":number"
				].comments[":commentId"].$patch({
					param: {
						orgId,
						projectId,
						number: String(issueNumber),
						commentId,
					},
					json: { body },
				}),
			),
		onSuccess: () => {
			invalidate();
			setEditingId(null);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (commentId: string) =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[
					":number"
				].comments[":commentId"].$delete({
					param: {
						orgId,
						projectId,
						number: String(issueNumber),
						commentId,
					},
				}),
			),
		onSuccess: () => {
			invalidate();
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
			{query.isError && (
				<Alert variant="destructive">
					<CircleAlert />
					<AlertDescription>{apiErrorMessage(t, query.error)}</AlertDescription>
				</Alert>
			)}

			{!query.isPending && comments.length === 0 && !query.isError && (
				<p className="text-muted-foreground text-sm">{t("comments.empty")}</p>
			)}

			<ul className="flex flex-col gap-5">
				{comments.map((comment) => {
					const own = session?.user.id === comment.author.id;
					const editing = editingId === comment.id;
					return (
						<li key={comment.id} className="flex gap-3">
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
										<span className="ml-auto flex items-center gap-1">
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
												{updateMutation.isPending && (
													<Loader2 className="animate-spin" />
												)}
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
									<div className="mt-1">
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
					{query.isFetchingNextPage && <Loader2 className="animate-spin" />}
					{t("common.loadMore")}
				</Button>
			)}

			{updateMutation.isError && (
				<Alert variant="destructive">
					<CircleAlert />
					<AlertDescription>
						{apiErrorMessage(t, updateMutation.error)}
					</AlertDescription>
				</Alert>
			)}

			<div className="rounded-lg border">
				<div className="border-b flex items-center gap-1 px-2 pt-1.5">
					{(["write", "preview"] as const).map((value) => (
						<button
							key={value}
							type="button"
							className={cn(
								"rounded-md px-2 py-1 text-xs font-medium",
								tab === value
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setTab(value)}
						>
							{t(`common.${value}`)}
						</button>
					))}
				</div>
				{tab === "write" ? (
					<>
						<Textarea
							value={body}
							placeholder={t("comments.placeholder")}
							onChange={(e) => setBody(e.target.value)}
							rows={4}
							maxLength={COMMENT_MAX_LENGTH}
							disabled={frozen}
							className="resize-y border-0 focus-visible:ring-0"
						/>
						<p className="text-muted-foreground px-3 pb-2 text-xs">
							{t("markdown.hint")}
						</p>
					</>
				) : (
					<div className="min-h-24 px-3 py-2">
						{body.trim() ? (
							<MarkdownContent>{body}</MarkdownContent>
						) : (
							<p className="text-muted-foreground text-sm">
								{t("comments.previewEmpty")}
							</p>
						)}
					</div>
				)}
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
						{createMutation.isPending && <Loader2 className="animate-spin" />}
						{t("comments.post")}
					</Button>
				</div>
			</div>
			{createMutation.isError && (
				<Alert variant="destructive">
					<CircleAlert />
					<AlertDescription>
						{apiErrorMessage(t, createMutation.error)}
					</AlertDescription>
				</Alert>
			)}

			<AlertDialog
				open={deleting !== null}
				onOpenChange={(open) => !open && setDeleting(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("comments.deleteTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("comments.deleteDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleteMutation.isPending || deleting === null}
							onClick={(e) => {
								e.preventDefault();
								if (deleting) {
									deleteMutation.mutate(deleting.id);
								}
							}}
						>
							{deleteMutation.isPending && <Loader2 className="animate-spin" />}
							{t("common.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			{deleteMutation.isError && (
				<Alert variant="destructive">
					<CircleAlert />
					<AlertDescription>
						{apiErrorMessage(t, deleteMutation.error)}
					</AlertDescription>
				</Alert>
			)}
		</section>
	);
}
