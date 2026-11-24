import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { CreateIssueRelationInput } from "@workspace/shared";
import { invalidateIssueQueries } from "@/features/issues/data";
import { issueRelationsKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";

export function issueRelationsQuery(
	orgId: string,
	projectId: string,
	number: number,
) {
	return queryOptions({
		queryKey: issueRelationsKey(orgId, projectId, number),
		queryFn: () =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[
					":number"
				].relations.$get({
					param: { orgId, projectId, number: String(number) },
				}),
			),
	});
}

export const createIssueRelation = (
	orgId: string,
	projectId: string,
	number: number,
	input: CreateIssueRelationInput,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[
			":number"
		].relations.$post({
			param: { orgId, projectId, number: String(number) },
			json: input,
		}),
	);

export const deleteIssueRelation = (
	orgId: string,
	projectId: string,
	number: number,
	relationId: string,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[
			":number"
		].relations[":relationId"].$delete({
			param: { orgId, projectId, number: String(number), relationId },
		}),
	);

export function useCreateIssueRelation(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: CreateIssueRelationInput) =>
			createIssueRelation(orgId, projectId, issueNumber, input),
		onSuccess: () => {
			void invalidateRelationQueries(
				queryClient,
				orgId,
				projectId,
				issueNumber,
			);
		},
	});
}

export function useDeleteIssueRelation(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (relationId: string) =>
			deleteIssueRelation(orgId, projectId, issueNumber, relationId),
		onSuccess: () => {
			void invalidateRelationQueries(
				queryClient,
				orgId,
				projectId,
				issueNumber,
			);
		},
	});
}

/**
 * Relation writes refresh the issue detail tree and org-wide lists.
 *
 * `issueKey` is a prefix of `issueRelationsKey` (and of the issue's activity
 * key), so invalidating it already covers the relation groups — no separate
 * relations invalidation is needed.
 */
export const invalidateRelationQueries = (
	queryClient: QueryClient,
	orgId: string,
	projectId: string,
	issueNumber: number,
) =>
	Promise.all([
		queryClient.invalidateQueries({
			queryKey: issueRelationsKey(orgId, projectId, issueNumber),
		}),
		invalidateIssueQueries(queryClient, orgId),
	]);
