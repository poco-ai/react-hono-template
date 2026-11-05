import type { TriageIssueDto, TriageListDto } from "@api/dto/issue.dto";
import type { StatusDto } from "@api/dto/status.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { StatusCategory, UpdateIssueInput } from "@workspace/shared";
import { z } from "zod";
import {
	BULK_PARTIAL_FAILURE,
	invalidateIssueQueries,
	updateIssue,
} from "@/features/issues/data";
import { issueDetailRootKey, triageKey, triageRootKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";
import { codedError } from "@/lib/errors";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export type { TriageIssueDto, TriageListDto };

export type TriageAction = "accept" | "decline";

export type TriageProject = { id: string };

/** URL filter state: an unknown/deleted project id falls back to "all". */
export const triageSearchSchema = z.object({
	projectId: z.string().optional().catch(undefined),
});

export type TriageSearch = z.infer<typeof triageSearchSchema>;

export const resolveTriageProjectFilter = (
	search: TriageSearch,
	projects: TriageProject[],
): string | undefined =>
	search.projectId &&
	projects.some((project) => project.id === search.projectId)
		? search.projectId
		: undefined;

/**
 * Triage queue: backlog-category issues without an assignee, newest first and
 * capped at 100 by the API. `projectId` narrows the queue to one project.
 */
export function triageQuery(orgId: string, projectId?: string) {
	return queryOptions({
		queryKey: triageKey(orgId, projectId),
		queryFn: (): Promise<TriageListDto> =>
			unwrap(
				client.api.orgs[":orgId"].triage.$get({
					param: { orgId },
					query: projectId ? { projectId } : {},
				}),
			),
	});
}

/** First status of a category in board order (position, then name). */
export const firstStatusOfCategory = (
	statuses: StatusDto[] | undefined,
	category: StatusCategory,
): StatusDto | undefined =>
	statuses
		?.filter((status) => status.category === category)
		.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))[0];

/**
 * Accept assigns the current user and moves the issue to the project's first
 * `unstarted` status; decline moves it to the first `canceled` status.
 * Returns null when the organization has no status of that category.
 */
export const triageActionInput = (
	action: TriageAction,
	{
		assigneeId,
		statuses,
	}: { assigneeId: string; statuses: StatusDto[] | undefined },
): UpdateIssueInput | null => {
	const status = firstStatusOfCategory(
		statuses,
		action === "accept" ? "unstarted" : "canceled",
	);
	if (!status) {
		return null;
	}
	return action === "accept"
		? { assigneeId, statusId: status.id }
		: { statusId: status.id };
};

export type TriageUpdate = {
	issue: TriageIssueDto;
	input: UpdateIssueInput;
	/** Drives success copy only; the request is fully described by `input`. */
	action: TriageAction;
};

/**
 * Pure disabled-state mapping for the queue controls. Frozen organizations are
 * fully read-only; while a write is pending every action is blocked but
 * selection stays usable; accept additionally needs a signed-in assignee.
 */
export type TriageAvailability = {
	select: boolean;
	accept: boolean;
	decline: boolean;
};

export const triageAvailability = ({
	frozen,
	busy = false,
	assigneeId,
}: {
	frozen: boolean;
	busy?: boolean;
	assigneeId?: string | null;
}): TriageAvailability => {
	const actionable = !frozen && !busy;
	return {
		select: !frozen,
		accept: actionable && Boolean(assigneeId),
		decline: actionable,
	};
};

export const triageAction = (orgId: string, { issue, input }: TriageUpdate) =>
	updateIssue(orgId, issue.projectId, issue.number, input);

/**
 * Runs every update independently; successful rows stay applied and any
 * failure surfaces as `BULK_PARTIAL_FAILURE` carrying the counts.
 */
export const runBulkTriage = async (
	updates: TriageUpdate[],
	execute: (update: TriageUpdate) => Promise<unknown>,
): Promise<void> => {
	const results = await Promise.allSettled(updates.map(execute));
	const failed = results.filter(
		(result) => result.status === "rejected",
	).length;
	if (failed > 0) {
		throw codedError("bulk triage partially failed", BULK_PARTIAL_FAILURE, {
			failed,
			total: updates.length,
		});
	}
};

const invalidateTriage = (
	queryClient: QueryClient,
	orgId: string,
	projectIds: Iterable<string>,
) =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: triageRootKey(orgId) }),
		invalidateIssueQueries(queryClient, orgId),
		...Array.from(new Set(projectIds)).map((projectId) =>
			queryClient.invalidateQueries({
				queryKey: issueDetailRootKey(orgId, projectId),
			}),
		),
	]);

/** Single accept/decline; the row leaves the queue once the list refreshes. */
export function useTriageIssue(
	orgId: string,
	callbacks?: MutationCallbacks<unknown, TriageUpdate>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (variables: TriageUpdate) => triageAction(orgId, variables),
		onSuccess: (...args) => {
			void invalidateTriage(queryClient, orgId, [args[1].issue.projectId]);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

/**
 * Bulk accept/decline: every row updates independently and partial failures
 * keep the successful rows; the count travels in `BULK_PARTIAL_FAILURE` so the
 * page can toast the existing partial-failure copy.
 */
export function useBulkTriageIssues(
	orgId: string,
	callbacks?: MutationCallbacks<unknown, TriageUpdate[]>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (updates: TriageUpdate[]) =>
			runBulkTriage(updates, (update) => triageAction(orgId, update)),
		onSettled: (_data, _error, variables) => {
			void invalidateTriage(
				queryClient,
				orgId,
				(variables ?? []).map((update) => update.issue.projectId),
			);
		},
	});
}
