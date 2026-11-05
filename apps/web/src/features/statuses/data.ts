import type { StatusDto } from "@api/dto/status.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type CreateStatusInput,
	normalizeStatusNameKey,
	type UpdateStatusInput,
} from "@workspace/shared";
import { invalidateIssueQueries } from "@/features/issues/data";
import { statusesKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export type { StatusDto };

export function statusesQuery(orgId: string) {
	return queryOptions({
		queryKey: statusesKey(orgId),
		queryFn: async (): Promise<StatusDto[]> =>
			unwrap(client.api.orgs[":orgId"].statuses.$get({ param: { orgId } })),
	});
}

/** Default status for new issues: explicit default, then first position. */
export function defaultStatusOf(
	statuses: StatusDto[] | undefined,
): StatusDto | undefined {
	return statuses?.find((status) => status.isDefault) ?? statuses?.[0];
}

/** Legacy compatibility: map a status name (e.g. `in_progress`) to its id. */
export function statusIdFromName(
	statuses: StatusDto[] | undefined,
	name: string,
): string | undefined {
	const key = normalizeStatusNameKey(name);
	return statuses?.find((status) => normalizeStatusNameKey(status.name) === key)
		?.id;
}

export function resolveStatusIds(
	statuses: StatusDto[] | undefined,
	ids: string[],
	legacyNames: string[],
) {
	const resolved = [...ids];
	for (const name of legacyNames) {
		const id = statusIdFromName(statuses, name);
		if (id) {
			resolved.push(id);
		}
	}
	return [...new Set(resolved)];
}

export const saveStatus = (
	orgId: string,
	statusId: string | undefined,
	input: CreateStatusInput | UpdateStatusInput,
) =>
	statusId
		? unwrap(
				client.api.orgs[":orgId"].statuses[":statusId"].$patch({
					param: { orgId, statusId },
					json: input as UpdateStatusInput,
				}),
			)
		: unwrap(
				client.api.orgs[":orgId"].statuses.$post({
					param: { orgId },
					json: input as CreateStatusInput,
				}),
			);

export function useSaveStatus(
	orgId: string,
	statusId: string | undefined,
	callbacks?: MutationCallbacks<
		StatusDto,
		CreateStatusInput | UpdateStatusInput
	>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (input: CreateStatusInput | UpdateStatusInput) =>
			saveStatus(orgId, statusId, input),
		onSuccess: (...args) => {
			void invalidateStatusQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useSetDefaultStatus(
	orgId: string,
	callbacks?: MutationCallbacks<StatusDto, string>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (statusId: string) =>
			saveStatus(orgId, statusId, { isDefault: true }),
		onSuccess: (...args) => {
			void invalidateStatusQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useReorderStatuses(
	orgId: string,
	callbacks?: MutationCallbacks<StatusDto[], string[]>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (ids: string[]) =>
			unwrap(
				client.api.orgs[":orgId"].statuses.reorder.$put({
					param: { orgId },
					json: { ids },
				}),
			),
		onSuccess: (...args) => {
			void invalidateStatusQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useDeleteStatus(
	orgId: string,
	callbacks?: MutationCallbacks<
		{ deleted: boolean; migratedIssueCount: number },
		{ statusId: string; migrateToStatusId: string }
	>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: ({
			statusId,
			migrateToStatusId,
		}: {
			statusId: string;
			migrateToStatusId: string;
		}) =>
			unwrap(
				client.api.orgs[":orgId"].statuses[":statusId"].$delete({
					param: { orgId, statusId },
					query: { migrateToStatusId },
				}),
			),
		onSuccess: (...args) => {
			void invalidateStatusQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

/**
 * Status writes change board columns and every issue rendering, so refresh
 * the status list plus all issue/detail/project-stat caches.
 */
export const invalidateStatusQueries = (
	queryClient: QueryClient,
	orgId: string,
) =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: statusesKey(orgId) }),
		invalidateIssueQueries(queryClient, orgId),
	]);
