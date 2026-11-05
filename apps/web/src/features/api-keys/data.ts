import type { ListApiKeysDto } from "@api/dto/api-key.dto";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { apiKeysKey, apiKeysRootKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";
import { useInvalidatingMutation } from "@/lib/feature-mutation";

import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export const API_KEYS_PAGE_SIZE = 10;

export function apiKeysQuery(orgId: string, page: number) {
	return queryOptions({
		queryKey: apiKeysKey(orgId, page),
		queryFn: (): Promise<ListApiKeysDto> =>
			unwrap(
				client.api.orgs[":orgId"]["api-keys"].$get({
					param: { orgId },
					query: {
						page: String(page),
						pageSize: String(API_KEYS_PAGE_SIZE),
					},
				}),
			),
	});
}

export const revokeApiKey = (orgId: string, keyId: string) =>
	unwrap(
		client.api.orgs[":orgId"]["api-keys"][":keyId"].$delete({
			param: { orgId, keyId },
		}),
	);

export function useRevokeApiKey(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof revokeApiKey>>,
		string
	>,
) {
	return useInvalidatingMutation({
		mutationFn: (input: string) => revokeApiKey(orgId, input),
		invalidate: (queryClient) => invalidateApiKeyQueries(queryClient, orgId),
		callbacks,
	});
}

export const createApiKey = async (orgId: string, input: { name: string }) =>
	unwrap(
		client.api.orgs[":orgId"]["api-keys"].$post({
			param: { orgId },
			json: input,
		}),
	);

export function useCreateApiKey(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof createApiKey>>,
		{ name: string }
	>,
) {
	return useInvalidatingMutation({
		mutationFn: (input: { name: string }) => createApiKey(orgId, input),
		invalidate: (queryClient) => invalidateApiKeyQueries(queryClient, orgId),
		callbacks,
	});
}

export const invalidateApiKeyQueries = (client: QueryClient, orgId: string) =>
	client.invalidateQueries({ queryKey: apiKeysRootKey(orgId) });
