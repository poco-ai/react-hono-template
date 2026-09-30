import type { ListCommentsDto } from "@api/dto/comment.dto";
import {
	infiniteQueryOptions,
	type QueryClient,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import {
	issueActivitiesKey,
	orgActivitiesRootKey,
} from "@/features/activities/data";
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
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[
			":number"
		].comments.$post({
			param: { orgId, projectId, number: String(issueNumber) },
			json: { body: input },
		}),
	);

export function useCreateComment(
	orgId: string,
	projectId: string,
	issueNumber: number,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof createComment>>,
		string
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: string) =>
			createComment(orgId, projectId, issueNumber, input),
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
