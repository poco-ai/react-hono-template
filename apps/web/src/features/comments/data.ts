import type {
	CommentDto,
	CommentReactionSummaryDto,
	ListCommentsDto,
} from "@api/dto/comment.dto";
import {
	type InfiniteData,
	infiniteQueryOptions,
	type QueryClient,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import {
	COMMENT_REACTION_EMOJIS,
	type CommentReactionEmoji,
} from "@workspace/shared";
import {
	issueActivitiesKey,
	orgActivitiesRootKey,
} from "@/features/activities/data";
import {
	deleteCommentAttachment,
	uploadCommentAttachment,
} from "@/features/attachments/data";
import { billingRootKey } from "@/features/billing/data";
import { issueSubscriptionKey } from "@/features/notifications/data";
import { client, unwrap } from "@/lib/api";

import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export const COMMENTS_PAGE_SIZE = 20;

export function commentsQueryKey(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	return [
		"orgs",
		orgId,
		"projects",
		projectId,
		"issues",
		"detail",
		issueNumber,
		"comments",
	] as const;
}

export function fetchCommentsPage(
	orgId: string,
	projectId: string,
	issueNumber: number,
	page: number,
): Promise<ListCommentsDto> {
	return unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[
			":number"
		].comments.$get({
			param: { orgId, projectId, number: String(issueNumber) },
			query: { page: String(page), pageSize: String(COMMENTS_PAGE_SIZE) },
		}),
	);
}

export const createComment = (
	orgId: string,
	projectId: string,
	issueNumber: number,
	input: string,
	parentId?: string | null,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[
			":number"
		].comments.$post({
			param: { orgId, projectId, number: String(issueNumber) },
			json: parentId ? { body: input, parentId } : { body: input },
		}),
	);

/**
 * Groups a flat comment page into one-level threads. Replies whose parent is
 * not on the loaded pages (a page boundary split) are kept as orphan threads
 * instead of disappearing; they re-attach once the parent page arrives.
 */
export type CommentThread = {
	comment: CommentDto;
	replies: CommentDto[];
	orphan: boolean;
};

const byCreatedAt = (a: CommentDto, b: CommentDto) =>
	a.createdAt.localeCompare(b.createdAt);

export function groupCommentThreads(
	comments: readonly CommentDto[],
): CommentThread[] {
	const threads: CommentThread[] = [];
	const byId = new Map<string, CommentThread>();
	for (const comment of comments) {
		if (comment.parentId) {
			continue;
		}
		const thread: CommentThread = { comment, replies: [], orphan: false };
		threads.push(thread);
		byId.set(comment.id, thread);
	}
	for (const comment of comments) {
		if (!comment.parentId) {
			continue;
		}
		const parent = byId.get(comment.parentId);
		if (parent) {
			parent.replies.push(comment);
			continue;
		}
		const orphan: CommentThread = { comment, replies: [], orphan: true };
		threads.push(orphan);
		byId.set(comment.id, orphan);
	}
	for (const thread of threads) {
		thread.replies.sort(byCreatedAt);
	}
	threads.sort((a, b) => byCreatedAt(a.comment, b.comment));
	return threads;
}

const reactionOrder = new Map<string, number>(
	COMMENT_REACTION_EMOJIS.map((emoji, index) => [emoji, index]),
);

const sortReactions = (reactions: CommentReactionSummaryDto[]) =>
	[...reactions].sort(
		(a, b) =>
			(reactionOrder.get(a.emoji) ?? Number.MAX_SAFE_INTEGER) -
			(reactionOrder.get(b.emoji) ?? Number.MAX_SAFE_INTEGER),
	);

/** Optimistic reaction aggregate for one emoji (add, remove or un-toggle). */
export function applyReactionToggle(
	reactions: readonly CommentReactionSummaryDto[],
	emoji: CommentReactionEmoji,
): CommentReactionSummaryDto[] {
	const existing = reactions.find((reaction) => reaction.emoji === emoji);
	if (!existing) {
		return sortReactions([...reactions, { emoji, count: 1, mine: true }]);
	}
	if (existing.mine) {
		return existing.count <= 1
			? sortReactions(reactions.filter((reaction) => reaction.emoji !== emoji))
			: sortReactions(
					reactions.map((reaction) =>
						reaction.emoji === emoji
							? { ...reaction, count: reaction.count - 1, mine: false }
							: reaction,
					),
				);
	}
	return sortReactions(
		reactions.map((reaction) =>
			reaction.emoji === emoji
				? { ...reaction, count: reaction.count + 1, mine: true }
				: reaction,
		),
	);
}

const isAbortError = (error: unknown): boolean =>
	typeof error === "object" &&
	error !== null &&
	(error as { name?: unknown }).name === "AbortError";

export function usePostComment(
	orgId: string,
	projectId: string,
	issueNumber: number,
	callbacks?: MutationCallbacks<
		{
			comment: Awaited<ReturnType<typeof createComment>>;
			failed: { file: File; error: unknown }[];
		},
		{
			body: string;
			files: File[];
			parentId?: string | null;
			signal?: AbortSignal;
		}
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: async ({
			body,
			files,
			parentId,
			signal,
		}: {
			body: string;
			files: File[];
			parentId?: string | null;
			signal?: AbortSignal;
		}) => {
			const comment = await createComment(
				orgId,
				projectId,
				issueNumber,
				body,
				parentId,
			);
			const failed: { file: File; error: unknown }[] = [];
			for (const file of files) {
				try {
					await uploadCommentAttachment(
						orgId,
						projectId,
						issueNumber,
						comment.id,
						{ file, signal },
					);
				} catch (error) {
					if (isAbortError(error)) throw error;
					failed.push({ file, error });
				}
			}
			return { comment, failed };
		},
		onSettled: (...args) => {
			void invalidateCommentQueries(queryClient, orgId, projectId, issueNumber);
			return callbacks?.onSettled?.(...args);
		},
	});
}

export function useDeleteCommentAttachment(
	orgId: string,
	projectId: string,
	issueNumber: number,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof deleteCommentAttachment>>,
		{ commentId: string; attachmentId: string }
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: { commentId: string; attachmentId: string }) =>
			deleteCommentAttachment(
				orgId,
				projectId,
				issueNumber,
				input.commentId,
				input.attachmentId,
			),
		onSuccess: (...args) => {
			void invalidateCommentQueries(queryClient, orgId, projectId, issueNumber);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const updateComment = (
	orgId: string,
	projectId: string,
	issueNumber: number,
	{ commentId, body }: { commentId: string; body: string },
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[":number"].comments[
			":commentId"
		].$patch({
			param: {
				orgId,
				projectId,
				number: String(issueNumber),
				commentId,
			},
			json: { body },
		}),
	);

export function useUpdateComment(
	orgId: string,
	projectId: string,
	issueNumber: number,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof updateComment>>,
		{ commentId: string; body: string }
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: { commentId: string; body: string }) =>
			updateComment(orgId, projectId, issueNumber, input),
		onSuccess: (...args) => {
			void invalidateCommentQueries(queryClient, orgId, projectId, issueNumber);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const deleteComment = (
	orgId: string,
	projectId: string,
	issueNumber: number,
	commentId: string,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[":number"].comments[
			":commentId"
		].$delete({
			param: {
				orgId,
				projectId,
				number: String(issueNumber),
				commentId,
			},
		}),
	);

export function useDeleteComment(
	orgId: string,
	projectId: string,
	issueNumber: number,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof deleteComment>>,
		string
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: string) =>
			deleteComment(orgId, projectId, issueNumber, input),
		onSuccess: (...args) => {
			void invalidateCommentQueries(queryClient, orgId, projectId, issueNumber);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const resolveComment = (
	orgId: string,
	projectId: string,
	issueNumber: number,
	{ commentId, resolved }: { commentId: string; resolved: boolean },
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[":number"].comments[
			":commentId"
		].resolve.$put({
			param: {
				orgId,
				projectId,
				number: String(issueNumber),
				commentId,
			},
			json: { resolved },
		}),
	);

/**
 * Resolving writes an activity row, so the thread and both activity feeds are
 * refreshed — but seat/billing data is untouched by a resolve.
 */
export const invalidateCommentResolution = (
	client: QueryClient,
	orgId: string,
	projectId: string,
	issueNumber: number,
) =>
	Promise.all([
		client.invalidateQueries({
			queryKey: commentsQueryKey(orgId, projectId, issueNumber),
		}),
		client.invalidateQueries({
			queryKey: issueActivitiesKey(orgId, projectId, issueNumber),
		}),
		client.invalidateQueries({ queryKey: orgActivitiesRootKey(orgId) }),
	]);

export function useResolveComment(
	orgId: string,
	projectId: string,
	issueNumber: number,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof resolveComment>>,
		{ commentId: string; resolved: boolean }
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: { commentId: string; resolved: boolean }) =>
			resolveComment(orgId, projectId, issueNumber, input),
		onSuccess: (...args) => {
			void invalidateCommentResolution(
				queryClient,
				orgId,
				projectId,
				issueNumber,
			);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const toggleCommentReaction = (
	orgId: string,
	projectId: string,
	issueNumber: number,
	{ commentId, emoji }: { commentId: string; emoji: CommentReactionEmoji },
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[":number"].comments[
			":commentId"
		].reactions.$post({
			param: {
				orgId,
				projectId,
				number: String(issueNumber),
				commentId,
			},
			json: { emoji },
		}),
	);

/** Reactions never write activity, so only the comment list is refreshed. */
export const invalidateCommentReactions = (
	client: QueryClient,
	orgId: string,
	projectId: string,
	issueNumber: number,
) =>
	client.invalidateQueries({
		queryKey: commentsQueryKey(orgId, projectId, issueNumber),
	});

export type ToggleCommentReactionInput = {
	commentId: string;
	emoji: CommentReactionEmoji;
};

export function useToggleCommentReaction(
	orgId: string,
	projectId: string,
	issueNumber: number,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof toggleCommentReaction>>,
		ToggleCommentReactionInput
	>,
) {
	const queryClient = useQueryClient();
	const queryKey = commentsQueryKey(orgId, projectId, issueNumber);
	type CommentsData = InfiniteData<ListCommentsDto, number>;

	const patchReactions = (
		previous: CommentsData | undefined,
		commentId: string,
		next: (
			reactions: CommentReactionSummaryDto[],
		) => CommentReactionSummaryDto[],
	): CommentsData | undefined =>
		previous
			? {
					...previous,
					pages: previous.pages.map((page) => ({
						...page,
						items: page.items.map((item) =>
							item.id === commentId
								? { ...item, reactions: next(item.reactions) }
								: item,
						),
					})),
				}
			: previous;

	return useMutation({
		...callbacks,
		mutationFn: (input: ToggleCommentReactionInput) =>
			toggleCommentReaction(orgId, projectId, issueNumber, input),
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey });
			const previous = queryClient.getQueryData<CommentsData>(queryKey);
			if (previous) {
				queryClient.setQueryData<CommentsData>(
					queryKey,
					patchReactions(previous, input.commentId, (reactions) =>
						applyReactionToggle(reactions, input.emoji),
					),
				);
			}
			return { previous };
		},
		onError: (error, input, result, context) => {
			if (result?.previous) {
				queryClient.setQueryData(queryKey, result.previous);
			}
			return callbacks?.onError?.(error, input, result, context);
		},
		onSuccess: (data, input, result, context) => {
			// Reconcile with the server aggregate, then refresh only the list.
			queryClient.setQueryData<CommentsData>(queryKey, (previous) =>
				patchReactions(previous, data.commentId, () => data.reactions),
			);
			void invalidateCommentReactions(
				queryClient,
				orgId,
				projectId,
				issueNumber,
			);
			return callbacks?.onSuccess?.(data, input, result, context);
		},
	});
}

/**
 * A comment can create/refresh the author's subscription, or add a mention
 * (which subscribes the mentioned user), so the issue subscription cache is
 * refreshed together with the thread and activity feeds.
 */
export const invalidateCommentQueries = (
	client: QueryClient,
	orgId: string,
	projectId: string,
	issueNumber: number,
) =>
	Promise.all([
		client.invalidateQueries({
			queryKey: commentsQueryKey(orgId, projectId, issueNumber),
		}),
		client.invalidateQueries({
			queryKey: issueActivitiesKey(orgId, projectId, issueNumber),
		}),
		client.invalidateQueries({ queryKey: orgActivitiesRootKey(orgId) }),
		client.invalidateQueries({ queryKey: billingRootKey(orgId) }),
		client.invalidateQueries({
			queryKey: issueSubscriptionKey(orgId, projectId, issueNumber),
		}),
	]);

export function commentsQuery(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	return infiniteQueryOptions({
		queryKey: commentsQueryKey(orgId, projectId, issueNumber),
		queryFn: ({ pageParam }) =>
			fetchCommentsPage(orgId, projectId, issueNumber, pageParam),
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.page < Math.max(1, Math.ceil(lastPage.total / lastPage.pageSize))
				? lastPage.page + 1
				: undefined,
	});
}
