import type {
	CycleRolloverDto,
	CycleWithProgressDto,
	ListCyclesDto,
} from "@api/dto/cycle.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	CreateCycleInput,
	CycleStatusFilter,
	RolloverCycleInput,
	UpdateCycleInput,
} from "@workspace/shared";
import { invalidateIssueQueries } from "@/features/issues/data";
import { cycleKey, cyclesRootKey, issueDetailRootKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export type { CycleRolloverDto, CycleWithProgressDto, ListCyclesDto };

/** The cycles page loads every cycle of a project and groups it client-side. */
export const CYCLES_PAGE_SIZE = 100;

export function cyclesQuery(
	orgId: string,
	projectId: string,
	status: CycleStatusFilter = "all",
) {
	return queryOptions({
		queryKey: cyclesKey(orgId, projectId, status),
		queryFn: (): Promise<ListCyclesDto> =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].cycles.$get({
					param: { orgId, projectId },
					query: {
						status,
						page: "1",
						pageSize: String(CYCLES_PAGE_SIZE),
					},
				}),
			),
	});
}

/** Cycles still running; at most one because ranges cannot overlap. */
export function currentCycleQuery(orgId: string, projectId: string) {
	return cyclesQuery(orgId, projectId, "current");
}

export function cycleQuery(orgId: string, projectId: string, cycleId: string) {
	return queryOptions({
		queryKey: cycleKey(orgId, projectId, cycleId),
		queryFn: (): Promise<CycleWithProgressDto> =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].cycles[
					":cycleId"
				].$get({ param: { orgId, projectId, cycleId } }),
			),
	});
}

export const createCycle = (
	orgId: string,
	projectId: string,
	input: CreateCycleInput,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].cycles.$post({
			param: { orgId, projectId },
			json: input,
		}),
	);

export const updateCycle = (
	orgId: string,
	projectId: string,
	cycleId: string,
	input: UpdateCycleInput,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].cycles[":cycleId"].$patch({
			param: { orgId, projectId, cycleId },
			json: input,
		}),
	);

export const deleteCycle = (
	orgId: string,
	projectId: string,
	cycleId: string,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].cycles[":cycleId"].$delete(
			{ param: { orgId, projectId, cycleId } },
		),
	);

/**
 * Request shape for a cycle rollover: the source cycle is part of the path and
 * the target travels in the JSON body. Exported so tests can assert that the
 * dialog's selection reaches the right place.
 */
export const rolloverRequest = (
	orgId: string,
	projectId: string,
	sourceCycleId: string,
	targetCycleId: string,
) => ({
	param: { orgId, projectId, cycleId: sourceCycleId },
	json: { targetCycleId } satisfies RolloverCycleInput,
});

export const rolloverCycle = (
	orgId: string,
	projectId: string,
	sourceCycleId: string,
	targetCycleId: string,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].cycles[
			":cycleId"
		].rollover.$post(
			rolloverRequest(orgId, projectId, sourceCycleId, targetCycleId),
		),
	);

export function useCreateCycle(
	orgId: string,
	projectId: string,
	callbacks?: MutationCallbacks<CycleWithProgressDto, CreateCycleInput>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (input: CreateCycleInput) =>
			createCycle(orgId, projectId, input),
		onSuccess: (...args) => {
			void invalidateCycleQueries(queryClient, orgId, projectId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useUpdateCycle(
	orgId: string,
	projectId: string,
	callbacks?: MutationCallbacks<
		CycleWithProgressDto,
		{ cycleId: string; input: UpdateCycleInput }
	>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: ({
			cycleId,
			input,
		}: {
			cycleId: string;
			input: UpdateCycleInput;
		}) => updateCycle(orgId, projectId, cycleId, input),
		onSuccess: (...args) => {
			void invalidateCycleQueries(queryClient, orgId, projectId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useDeleteCycle(
	orgId: string,
	projectId: string,
	callbacks?: MutationCallbacks<{ deleted: boolean }, string>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (cycleId: string) => deleteCycle(orgId, projectId, cycleId),
		onSuccess: (...args) => {
			void invalidateCycleQueries(queryClient, orgId, projectId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export type RolloverCycleVariables = {
	sourceCycleId: string;
	targetCycleId: string;
};

export function useRolloverCycle(
	orgId: string,
	projectId: string,
	callbacks?: MutationCallbacks<CycleRolloverDto, RolloverCycleVariables>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: ({ sourceCycleId, targetCycleId }: RolloverCycleVariables) =>
			rolloverCycle(orgId, projectId, sourceCycleId, targetCycleId),
		onSuccess: (...args) => {
			void invalidateCycleQueries(queryClient, orgId, projectId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

/** `status` is omitted for the unfiltered list so one prefix covers them all. */
export const cyclesKey = (
	orgId: string,
	projectId: string,
	status?: CycleStatusFilter,
) =>
	status && status !== "all"
		? ([...cyclesRootKey(orgId, projectId), status] as const)
		: cyclesRootKey(orgId, projectId);

/**
 * Cycle writes change assignments and progress, so the cycle lists/detail, the
 * issue lists and details, and the project statistics caches all refresh.
 * `invalidateIssueQueries` covers the project root (list rows, details,
 * project stats) plus org-wide issue lists and activity feeds.
 */
export const invalidateCycleQueries = (
	queryClient: QueryClient,
	orgId: string,
	projectId: string,
) =>
	Promise.all([
		queryClient.invalidateQueries({
			queryKey: cyclesRootKey(orgId, projectId),
		}),
		invalidateIssueQueries(queryClient, orgId),
		queryClient.invalidateQueries({
			queryKey: issueDetailRootKey(orgId, projectId),
		}),
	]);
