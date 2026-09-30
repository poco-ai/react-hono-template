import type { ListIssuesDto } from "@api/dto/issue.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type CreateIssueInput,
	ISSUE_PRIORITY,
	type IssuePriorityName,
	type IssueStatus,
	type UpdateIssueInput,
} from "@workspace/shared";
import { useTranslation } from "react-i18next";
import { orgActivitiesRootKey } from "@/features/activities/data";
import { projectsRootKey } from "@/features/projects/data";
import { client, unwrap } from "@/lib/api";

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
	status: IssueStatus[];
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
	status: filters.status?.length ? filters.status : undefined,
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
				if (input.status !== undefined) {
					next.status = input.status;
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
		},
	});
}

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
		mutationFn: (input: { id: string; number: number; status: IssueStatus }) =>
			updateIssue(orgId, projectId, input.number, { status: input.status }),
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: boardKey });
			const previous = queryClient.getQueryData(boardKey);
			queryClient.setQueryData(boardKey, (old) => {
				if (!old) {
					return old;
				}
				return {
					...old,
					items: old.items.map((issue) =>
						issue.id === input.id ? { ...issue, status: input.status } : issue,
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

export function useBulkUpdateIssues(orgId: string, projectId: string) {
	const queryClient = useQueryClient();
	const { t } = useTranslation();
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
			if (failed > 0)
				throw new Error(
					t("bulk.partialFailure", { failed, total: numbers.length }),
				);
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
export const issueKey = (orgId: string, projectId: string, number: number) =>
	["orgs", orgId, "projects", projectId, "issues", "detail", number] as const;
