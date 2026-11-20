import type { IssueDetailDto, ListIssuesDto } from "@api/dto/issue.dto";
import type { StatusDto } from "@api/dto/status.dto";
import {
	hashKey,
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	CreateIssueInput,
	CreateIssueRelationInput,
	ImportIssuesInput,
	IssueFilterGroup,
	IssueImportResultDto,
	IssueQueryGroupBy,
	IssueQuerySort,
	UpdateIssueInput,
} from "@workspace/shared";
import { invalidateFavoriteQueries } from "@/features/favorites/data";
import {
	issueKey,
	issueRelationsKey,
	orgActivitiesRootKey,
	orgIssuesRootKey,
	projectIssuesRootKey,
	projectsRootKey,
	roadmapRootKey,
	statusesKey,
	triageRootKey,
} from "@/features/keys";
import { client, unwrap } from "@/lib/api";
import { type CodedError, codedError, errorCode } from "@/lib/errors";
import { optimisticPatch } from "@/lib/optimistic";
import { useOptimisticMutation } from "@/lib/optimistic-mutation";
import {
	buildIssueListParams,
	DEFAULT_ISSUE_SORT,
	issueQueryKey,
} from "./query";

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

export const importProjectIssues = (
	orgId: string,
	projectId: string,
	input: ImportIssuesInput,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues.import.$post({
			param: { orgId, projectId },
			json: input,
		}),
	);

const apiBaseUrl = () =>
	(import.meta.env?.VITE_API_URL ?? "").replace(/\/$/, "");

/** Absolute export URL; the browser sends the session cookie. */
export const issueExportUrl = (orgId: string, projectId: string) =>
	`${apiBaseUrl()}/api/orgs/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/issues/export.csv`;

export type IssueExportDownload = {
	blob: Blob;
	filename: string;
	truncated: boolean;
	total: number;
};

/**
 * Downloads the project CSV as a Blob. Uses `fetch` instead of the typed Hono
 * client because the response is `text/csv`, not the `ApiResult` envelope.
 */
export async function exportProjectIssues(
	orgId: string,
	projectId: string,
): Promise<IssueExportDownload> {
	const response = await fetch(issueExportUrl(orgId, projectId), {
		credentials: "include",
	});
	if (!response.ok) {
		let code = "EXPORT_FAILED";
		let message = `Export failed (${response.status})`;
		try {
			const body = (await response.json()) as {
				ok: false;
				error: { code: string; message: string };
			};
			code = body.error.code;
			message = body.error.message;
		} catch {
			// Non-JSON error body: keep the HTTP status fallback.
		}
		throw Object.assign(new Error(message), { code, status: response.status });
	}
	const disposition = response.headers.get("Content-Disposition") ?? "";
	const filename =
		/filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? "issues.csv";
	return {
		blob: await response.blob(),
		filename,
		truncated: response.headers.get("X-Issue-Truncated") === "true",
		total: Number(response.headers.get("X-Issue-Total") ?? 0),
	};
}

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

/** Archives an issue: it disappears from lists/search/progress but stays readable. */
export const archiveIssue = (
	orgId: string,
	projectId: string,
	number: number,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[
			":number"
		].archive.$post({ param: { orgId, projectId, number: String(number) } }),
	);

/** Restores an archived issue to every list/search/progress calculation. */
export const restoreIssue = (
	orgId: string,
	projectId: string,
	number: number,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[
			":number"
		].restore.$post({ param: { orgId, projectId, number: String(number) } }),
	);

export type IssueArchiveAction = "archive" | "restore";

/** Menu mapping: archived issues offer Restore, active issues offer Archive. */
export const issueArchiveAction = (
	issue: Pick<IssueDetailDto, "archivedAt">,
): IssueArchiveAction => (issue.archivedAt ? "restore" : "archive");

/**
 * Issue list request state. The structured filter, sort list and grouping are
 * sent as-is; legacy flat params are converted by `features/issues/query`.
 */
export interface IssueFilters {
	filter?: IssueFilterGroup;
	sorts?: IssueQuerySort[];
	groupBy?: IssueQueryGroupBy;
	search: string;
	/** Flat cycle filter applied by the API alongside the structured filter. */
	cycleId?: string;
	/** Include archived issues; the API hides them by default. */
	includeArchived?: boolean;
	page: number;
	pageSize?: number;
}

export const ISSUE_PAGE_SIZE = 20;

const normalizedQuery = (filters: IssueFilters) => ({
	filter: filters.filter,
	sorts: filters.sorts?.length ? filters.sorts : [DEFAULT_ISSUE_SORT],
	groupBy: filters.groupBy,
	search: filters.search ?? "",
	cycleId: filters.cycleId || undefined,
	includeArchived: filters.includeArchived ?? false,
});

const buildQuery = (filters: IssueFilters) =>
	buildIssueListParams({
		...normalizedQuery(filters),
		page: filters.page ?? 1,
		pageSize: filters.pageSize ?? ISSUE_PAGE_SIZE,
	});

const issueListKey = (filters: IssueFilters) => ({
	...issueQueryKey(normalizedQuery(filters)),
	page: filters.page ?? 1,
	pageSize: filters.pageSize ?? ISSUE_PAGE_SIZE,
});

export function projectIssuesQuery(
	orgId: string,
	projectId: string,
	filters: IssueFilters,
) {
	const rowsKey = hashKey(
		projectIssuesKey(orgId, projectId, { ...filters, groupBy: undefined }),
	);
	return queryOptions({
		queryKey: projectIssuesKey(orgId, projectId, filters),
		// Grouping only changes presentation. Reusing rows across any other
		// transition would make old rows interactive under the new query.
		meta: { rowsKey },
		placeholderData: (previous, query) =>
			query?.meta?.rowsKey === rowsKey ? previous : undefined,
		queryFn: () =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues.$get({
					param: { orgId, projectId },
					// The API parses `filter`/`sort` JSON strings; the generated
					// client types describe the post-validation shape.
					query: buildQuery(filters) as never,
				}),
			),
	});
}

export function orgIssuesQuery(orgId: string, filters: IssueFilters) {
	return queryOptions({
		queryKey: orgIssuesKey(orgId, filters),
		queryFn: () =>
			unwrap(
				client.api.orgs[":orgId"].issues.$get({
					param: { orgId },
					query: buildQuery(filters) as never,
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
		queryKey: issueSearchKey(orgId, search, projectId, pageSize),
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
		// Issue writes change roadmap progress (open/total counts) and
		// archive/restore hides or reveals timeline entries.
		queryClient.invalidateQueries({ queryKey: roadmapRootKey(orgId) }),
		// The triage queue filters on backlog-category issues without an
		// assignee, so status/assignee/archive writes add or remove rows.
		queryClient.invalidateQueries({ queryKey: triageRootKey(orgId) }),
		// Favorite rows are hydrated with issue titles/status, and archived or
		// deleted issues are dropped from that list by the API.
		invalidateFavoriteQueries(queryClient, orgId),
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

/**
 * CSV import: valid rows are created server-side and invalid rows come back
 * as row errors (partial success). Writes refresh every issue surface.
 */
export function useImportIssues(orgId: string, projectId: string) {
	const queryClient = useQueryClient();
	return useMutation<IssueImportResultDto, Error, ImportIssuesInput>({
		mutationFn: (input) => importProjectIssues(orgId, projectId, input),
		onSettled: () => {
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
	return useOptimisticMutation({
		mutationFn: (input: UpdateIssueInput) =>
			updateIssue(orgId, projectId, issueNumber, input),
		optimistic: (input) =>
			optimisticPatch<IssueDetailDto>(detailKey, (issue) =>
				issue
					? applyIssueUpdate(
							issue,
							input,
							cachedStatus(queryClient, orgId, input.statusId),
						)
					: issue,
			),
		invalidate: (client) => invalidateIssueQueries(client, orgId),
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

/**
 * Archive/restore toggle for one issue. The detail cache is patched
 * optimistically (so the menu and the archived banner flip immediately) and
 * rolled back on failure; the settled write refreshes issue lists, details,
 * search, project/cycle statistics, sub-issue progress and favorites through
 * `invalidateIssueQueries` plus the detail root.
 */
export function useSetIssueArchived(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	const detailKey = issueQuery(orgId, projectId, issueNumber).queryKey;
	return useOptimisticMutation({
		mutationFn: (archived: boolean) =>
			archived
				? archiveIssue(orgId, projectId, issueNumber)
				: restoreIssue(orgId, projectId, issueNumber),
		optimistic: (archived) =>
			optimisticPatch<IssueDetailDto>(detailKey, (issue) =>
				issue
					? {
							...issue,
							archivedAt: archived ? new Date().toISOString() : null,
						}
					: issue,
			),
		invalidate: (client) => invalidateIssueQueries(client, orgId),
	});
}

/**
 * Applies a partial update to a cached issue row (list rows and detail share
 * the same shape). Title/description are merged like every other field, and the
 * resolved status object is patched as well when the caller knows it.
 */
export function applyIssueUpdate<T extends IssueDetailDto>(
	issue: T,
	input: UpdateIssueInput,
	status?: StatusDto,
): T {
	const next = { ...issue };
	if (input.title !== undefined) {
		next.title = input.title;
	}
	if (input.description !== undefined) {
		next.description = input.description;
	}
	if (input.statusId !== undefined) {
		next.statusId = input.statusId;
		if (status) {
			next.status = status;
		}
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
	if (input.cycleId !== undefined) {
		next.cycleId = input.cycleId;
	}
	return next;
}

/**
 * Status row for an optimistic `statusId`. Statuses are owned by
 * `features/statuses/data`; the shared key lives in `features/keys` so the two
 * data modules stay acyclic.
 */
const cachedStatus = (
	queryClient: QueryClient,
	orgId: string,
	statusId: string | undefined,
) =>
	statusId
		? queryClient
				.getQueryData<StatusDto[]>(statusesKey(orgId))
				?.find((entry) => entry.id === statusId)
		: undefined;

export interface IssueFieldUpdate {
	/** Row identity in the active list cache. */
	id: string;
	number: number;
	input: UpdateIssueInput;
}

/**
 * Inline list edits: optimistically patches the active list page, rolls back
 * on failure, then refreshes lists, details and activity feeds. Board drags use
 * `useMoveIssue`, which shares this request and invalidation policy.
 */
export function useIssueFieldUpdate(
	orgId: string,
	projectId: string,
	filters: IssueFilters,
) {
	const queryClient = useQueryClient();
	const listKey = projectIssuesQuery(orgId, projectId, filters).queryKey;
	return useOptimisticMutation({
		mutationFn: ({ number, input }: IssueFieldUpdate) =>
			updateIssue(orgId, projectId, number, input),
		optimistic: ({ id, input }) =>
			optimisticPatch<ListIssuesDto>(listKey, (old) =>
				old
					? {
							...old,
							items: old.items.map((issue) =>
								issue.id === id
									? applyIssueUpdate(
											issue,
											input,
											cachedStatus(queryClient, orgId, input.statusId),
										)
									: issue,
							),
						}
					: old,
			),
		invalidate: (client) => invalidateIssueQueries(client, orgId),
	});
}

export function useMoveIssue(
	orgId: string,
	projectId: string,
	filters: IssueFilters,
) {
	const queryClient = useQueryClient();
	const boardKey = projectIssuesQuery(orgId, projectId, filters).queryKey;
	return useOptimisticMutation({
		mutationFn: (input: { id: string; number: number; statusId: string }) =>
			updateIssue(orgId, projectId, input.number, {
				statusId: input.statusId,
			}),
		optimistic: (input) => {
			const status = cachedStatus(queryClient, orgId, input.statusId);
			return optimisticPatch<ListIssuesDto>(boardKey, (old) =>
				old
					? {
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
						}
					: old,
			);
		},
		invalidate: (client) => invalidateIssueQueries(client, orgId),
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

/**
 * Bulk writes refresh the org-wide issue surfaces; project detail keys are
 * already under the `projects` prefix invalidated by `invalidateIssueQueries`.
 */
export const invalidateBulkIssueQueries = (
	queryClient: QueryClient,
	orgId: string,
) => invalidateIssueQueries(queryClient, orgId);

export function useBulkUpdateIssues(orgId: string, projectId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (
			updates: { number: number; input: UpdateIssueInput }[],
		) => {
			const results = await Promise.allSettled(
				updates.map(({ number, input }) =>
					updateIssue(orgId, projectId, number, input),
				),
			);
			const failed = results.filter(
				(result) => result.status === "rejected",
			).length;
			if (failed > 0) {
				throw codedError("bulk update partially failed", BULK_PARTIAL_FAILURE, {
					failed,
					total: updates.length,
				});
			}
		},
		onSettled: () => {
			void invalidateBulkIssueQueries(queryClient, orgId);
		},
	});
}

export const projectIssuesKey = (
	orgId: string,
	projectId: string,
	filters: IssueFilters,
) =>
	[...projectIssuesRootKey(orgId, projectId), issueListKey(filters)] as const;
export const orgIssuesKey = (orgId: string, filters: IssueFilters) =>
	[...orgIssuesRootKey(orgId), issueListKey(filters)] as const;
export const issueSearchKey = (
	orgId: string,
	term: string,
	projectId?: string,
	pageSize = ISSUE_SEARCH_LIMIT,
) =>
	[
		...orgIssuesRootKey(orgId),
		"search",
		projectId ?? "all",
		term,
		pageSize,
	] as const;
