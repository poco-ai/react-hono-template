import type { IssueDetailDto, ListIssuesDto } from "@api/dto/issue.dto";
import { queryOptions } from "@tanstack/react-query";
import {
	ISSUE_PRIORITY,
	type IssuePriorityName,
	type IssueStatus,
} from "@workspace/shared";
import { client, unwrap } from "@/lib/api";

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
		queryKey: ["orgs", orgId, "projects", projectId, "issues", filters],
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
		queryKey: ["orgs", orgId, "issues", filters],
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
		queryKey: [
			"orgs",
			orgId,
			"projects",
			projectId,
			"issues",
			"detail",
			number,
		],
		queryFn: (): Promise<IssueDetailDto> =>
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
