import type { ListIssuesDto } from "@api/dto/issue.dto";
import type { StatusDto } from "@api/dto/status.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type CreateIssueInput,
	type CreateIssueRelationInput,
	ISSUE_PRIORITY,
	type IssuePriorityName,
	type UpdateIssueInput,
} from "@workspace/shared";
import { orgActivitiesRootKey } from "@/features/activities/data";
import { projectsRootKey } from "@/features/projects/data";
import { client, unwrap } from "@/lib/api";
import { type CodedError, codedError, errorCode } from "@/lib/errors";

export const createIssue = (
	orgId: string,
	projectId: string,
	input: CreateIssueInput,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues.$post({
			param: { orgId, projectId },
			json: input,
		}),
	);

export const updateIssue = (
	orgId: string,
	projectId: string,
	number: number,
	input: UpdateIssueInput,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[":number"].$patch({
			param: { orgId, projectId, number: String(number) },
			json: input,
		}),
	);

export const deleteIssue = (orgId: string, projectId: string, number: number) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[":number"].$delete({
			param: { orgId, projectId, number: String(number) },
		}),
	);

export type IssueSort = "updated" | "created" | "priority";

export interface IssueFilters {
	statusId: string[];
	priority: IssuePriorityName[];
	assigneeId?: string;
	labelId?: string;
	search: string;
	sort: IssueSort;
	page: number;
	pageSize?: number;
}

export const ISSUE_PAGE_SIZE = 20;

const buildQuery = (filters: Partial<IssueFilters>) => ({
	page: String(filters.page ?? 1),
	pageSize: String(filters.pageSize ?? ISSUE_PAGE_SIZE),
	statusId: filters.statusId?.length ? filters.statusId : undefined,
	priority: filters.priority?.length
		? filters.priority.map((name) => ISSUE_PRIORITY[name])
		: undefined,
	assigneeId: filters.assigneeId || undefined,
	labelId: filters.labelId || undefined,
	search: filters.search || undefined,
	sort: filters.sort ?? "updated",
});

export function projectIssuesQuery(
	orgId: string,
	projectId: string,
	filters: IssueFilters,
) {
	return queryOptions({
		queryKey: projectIssuesKey(orgId, projectId, filters),
		queryFn: () =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues.$get({
					param: { orgId, projectId },
					query: buildQuery(filters),
				}),
			),
	});
}

export function orgIssuesQuery(
	orgId: string,
	filters: Partial<IssueFilters> & { assigneeId: string },
) {
	return queryOptions({
		queryKey: orgIssuesKey(orgId, filters),
		queryFn: () =>
			unwrap(
				client.api.orgs[":orgId"].issues.$get({
					param: { orgId },
					query: buildQuery(filters),
				}),
			),
	});
}

/** Number of results the command palette requests per issue search. */
export const ISSUE_SEARCH_LIMIT = 8;

/** Result page size used by in-dialog issue pickers (relation / parent). */
export const ISSUE_PICKER_PAGE_SIZE = 20;

/** Minimum term length before the palette's issue search queries the API. */
export const ISSUE_SEARCH_MIN_LENGTH = 2;

/**
 * Org-wide issue search used by the command palette and the issue pickers.
 * The query stays disabled until the (trimmed) term reaches
 * `ISSUE_SEARCH_MIN_LENGTH`. Pass `projectId` to scope the search to one
 * project server-side (pickers do not re-filter results client-side).
 */
export function issueSearchQuery(
	orgId: string,
	term: string,
	{
		projectId,
		pageSize = ISSUE_SEARCH_LIMIT,
	}: {
		projectId?: string;
		pageSize?: number;
	} = {},
) {
	const search = term.trim();
	return queryOptions({
		queryKey: issueSearchKey(orgId, search, projectId),
		queryFn: () =>
			unwrap(
				client.api.orgs[":orgId"].issues.$get({
					param: { orgId },
					query: {
						page: "1",
						pageSize: String(pageSize),
						search,
						sort: "updated",
						projectId,
					},
				}),
			),
		enabled: search.length >= ISSUE_SEARCH_MIN_LENGTH,
	});
}

export function issueQuery(orgId: string, projectId: string, number: number) {
	return queryOptions({
		queryKey: issueKey(orgId, projectId, number),
		queryFn: () =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[":number"].$get(
					{
						param: { orgId, projectId, number: String(number) },
					},
				),
			),
	});
}

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

export type { ListIssuesDto };

export const invalidateIssueQueries = (
	queryClient: QueryClient,
	orgId: string,
) =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: projectsRootKey(orgId) }),
		queryClient.invalidateQueries({ queryKey: orgIssuesRootKey(orgId) }),
		queryClient.invalidateQueries({ queryKey: orgActivitiesRootKey(orgId) }),
	]);

export function useCreateIssue(orgId: string, projectId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: CreateIssueInput) =>
			createIssue(orgId, projectId, input),
		onSuccess: () => {
			void invalidateIssueQueries(queryClient, orgId);
			// Detail keys live under ["orgs", orgId, "projects", ...], which the
			// list/project prefixes above do not cover. Creating a sub-issue
			// changes the parent's child list and progress.
			void queryClient.invalidateQueries({
				queryKey: issueDetailRootKey(orgId, projectId),
			});
		},
	});
}

export function useUpdateIssue(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	const queryClient = useQueryClient();
	const detailKey = issueQuery(orgId, projectId, issueNumber).queryKey;
	return useMutation({
		mutationFn: (input: UpdateIssueInput) =>
			updateIssue(orgId, projectId, issueNumber, input),
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: detailKey });
			const previous = queryClient.getQueryData(detailKey);
			queryClient.setQueryData(detailKey, (old) => {
				if (!old) {
					return old;
				}
				const next = { ...old };
				if (input.title !== undefined) {
					next.title = input.title;
				}
				if (input.description !== undefined) {
					next.description = input.description;
				}
				if (input.statusId !== undefined) {
					next.statusId = input.statusId;
				}
				if (input.priority !== undefined) {
					next.priority = input.priority ?? 0;
				}
				if (input.assigneeId !== undefined) {
					next.assigneeId = input.assigneeId;
				}
				if (input.dueDate !== undefined) {
					next.dueDate = input.dueDate;
				}
				if (input.estimate !== undefined) {
					next.estimate = input.estimate;
				}
				if (input.labelIds !== undefined) {
					next.labelIds = input.labelIds;
				}
				return next;
			});
			return { previous };
		},
		onError: (_error, _input, context) => {
			if (context?.previous) {
				queryClient.setQueryData(detailKey, context.previous);
			}
		},
		onSettled: () => {
			void invalidateIssueQueries(queryClient, orgId);
			// Detail/activity keys are not under the list prefixes; a child's
			// status change must also refresh its parent's sub-issue progress.
			void queryClient.invalidateQueries({
				queryKey: issueDetailRootKey(orgId, projectId),
			});
		},
	});
}

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
			queryKey: issueKey(orgId, projectId, issueNumber),
		}),
		invalidateIssueQueries(queryClient, orgId),
	]);

export function useDeleteIssue(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => deleteIssue(orgId, projectId, issueNumber),
		onSuccess: () => {
			void invalidateIssueQueries(queryClient, orgId);
		},
	});
}

export function useMoveIssue(
	orgId: string,
	projectId: string,
	filters: IssueFilters,
) {
	const queryClient = useQueryClient();
	const boardKey = projectIssuesQuery(orgId, projectId, filters).queryKey;
	return useMutation({
		mutationFn: (input: { id: string; number: number; statusId: string }) =>
			updateIssue(orgId, projectId, input.number, {
				statusId: input.statusId,
			}),
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: boardKey });
			const previous = queryClient.getQueryData(boardKey);
			// The statuses cache is owned by features/statuses/data; read its key
			// directly here to keep the two data modules import-acyclic.
			const statuses = queryClient.getQueryData<StatusDto[]>([
				"orgs",
				orgId,
				"statuses",
			]);
			const status = statuses?.find((entry) => entry.id === input.statusId);
			queryClient.setQueryData(boardKey, (old) => {
				if (!old) {
					return old;
				}
				return {
					...old,
					items: old.items.map((issue) =>
						issue.id === input.id
							? {
									...issue,
									statusId: input.statusId,
									status: status ?? issue.status,
								}
							: issue,
					),
				};
			});
			return { previous };
		},
		onError: (_error, _input, context) => {
			if (context?.previous) {
				queryClient.setQueryData(boardKey, context.previous);
			}
		},
		onSettled: () => {
			void invalidateIssueQueries(queryClient, orgId);
		},
	});
}

export const BULK_PARTIAL_FAILURE = "BULK_PARTIAL_FAILURE";

/** Counts reported by a bulk partial failure, or null for unrelated errors. */
export function bulkPartialFailure(
	error: unknown,
): { failed: number; total: number } | null {
	if (errorCode(error) !== BULK_PARTIAL_FAILURE) {
		return null;
	}
	const { failed, total } = (error as CodedError).details ?? {};
	return typeof failed === "number" && typeof total === "number"
		? { failed, total }
		: null;
}

export function useBulkUpdateIssues(orgId: string, projectId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			numbers,
			input,
		}: {
			numbers: number[];
			input: UpdateIssueInput;
		}) => {
			const results = await Promise.allSettled(
				numbers.map((number) => updateIssue(orgId, projectId, number, input)),
			);
			const failed = results.filter(
				(result) => result.status === "rejected",
			).length;
			if (failed > 0) {
				throw codedError("bulk update partially failed", BULK_PARTIAL_FAILURE, {
					failed,
					total: numbers.length,
				});
			}
		},
		onSettled: () => {
			void invalidateIssueQueries(queryClient, orgId);
		},
	});
}

export const projectIssuesKey = (
	orgId: string,
	projectId: string,
	filters: IssueFilters,
) => ["orgs", orgId, "projects", projectId, "issues", filters] as const;
export const orgIssuesRootKey = (orgId: string) =>
	["orgs", orgId, "issues"] as const;
export const orgIssuesKey = (
	orgId: string,
	filters: Partial<IssueFilters> & { assigneeId: string },
) => [...orgIssuesRootKey(orgId), filters] as const;
export const issueSearchKey = (
	orgId: string,
	term: string,
	projectId?: string,
) => [...orgIssuesRootKey(orgId), "search", projectId ?? "all", term] as const;
export const issueKey = (orgId: string, projectId: string, number: number) =>
	["orgs", orgId, "projects", projectId, "issues", "detail", number] as const;
export const issueDetailRootKey = (orgId: string, projectId: string) =>
	["orgs", orgId, "projects", projectId, "issues", "detail"] as const;
export const issueRelationsKey = (
	orgId: string,
	projectId: string,
	number: number,
) => [...issueKey(orgId, projectId, number), "relations"] as const;
