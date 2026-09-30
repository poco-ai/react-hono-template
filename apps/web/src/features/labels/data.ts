import type { LabelDto } from "@api/dto/label.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { invalidateIssueQueries } from "@/features/issues/data";
import { client, unwrap } from "@/lib/api";

import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export function labelsQuery(orgId: string) {
	return queryOptions({
		queryKey: labelsKey(orgId),
		queryFn: async (): Promise<LabelDto[]> =>
			unwrap(client.api.orgs[":orgId"].labels.$get({ param: { orgId } })),
	});
}

export const saveLabel = (
	orgId: string,
	labelId: string | undefined,
	input: { name: string; color: string },
) =>
	labelId
		? unwrap(
				client.api.orgs[":orgId"].labels[":labelId"].$patch({
					param: { orgId, labelId: labelId },
					json: input,
				}),
			)
		: unwrap(
				client.api.orgs[":orgId"].labels.$post({
					param: { orgId },
					json: input,
				}),
			);

export function useSaveLabel(
	orgId: string,
	labelId: string | undefined,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof saveLabel>>,
		{ name: string; color: string }
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: { name: string; color: string }) =>
			saveLabel(orgId, labelId, input),
		onSuccess: (...args) => {
			void invalidateLabelQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const deleteLabel = (orgId: string, labelId: string) =>
	unwrap(
		client.api.orgs[":orgId"].labels[":labelId"].$delete({
			param: { orgId, labelId },
		}),
	);

export function useDeleteLabel(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof deleteLabel>>,
		string
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: string) => deleteLabel(orgId, input),
		onSuccess: (...args) => {
			void invalidateLabelQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const labelsKey = (orgId: string) => ["orgs", orgId, "labels"] as const;
export const invalidateLabelQueries = (client: QueryClient, orgId: string) =>
	Promise.all([
		client.invalidateQueries({ queryKey: labelsKey(orgId) }),
		invalidateIssueQueries(client, orgId),
	]);
