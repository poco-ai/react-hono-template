import type { LabelDto } from "@api/dto/label.dto";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { invalidateIssueQueries } from "@/features/issues/data";
import { labelsKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";
import { useInvalidatingMutation } from "@/lib/feature-mutation";

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
	return useInvalidatingMutation({
		mutationFn: (input: { name: string; color: string }) =>
			saveLabel(orgId, labelId, input),
		invalidate: (queryClient) => invalidateLabelQueries(queryClient, orgId),
		callbacks,
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
	return useInvalidatingMutation({
		mutationFn: (input: string) => deleteLabel(orgId, input),
		invalidate: (queryClient) => invalidateLabelQueries(queryClient, orgId),
		callbacks,
	});
}

export const invalidateLabelQueries = (client: QueryClient, orgId: string) =>
	Promise.all([
		client.invalidateQueries({ queryKey: labelsKey(orgId) }),
		invalidateIssueQueries(client, orgId),
	]);
