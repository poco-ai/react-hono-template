import type { ListApiKeysDto } from "@api/dto/api-key.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { client, unwrap } from "@/lib/api";

import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export const API_KEYS_PAGE_SIZE = 10;

export function apiKeysRootKey(orgId: string) {
	return ["orgs", orgId, "api-keys"] as const;
}

export function apiKeysQuery(orgId: string, page: number) {
	return queryOptions({
		queryKey: ["orgs", orgId, "api-keys", page] as const,
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
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: string) => revokeApiKey(orgId, input),
		onSuccess: (...args) => {
			void invalidateApiKeyQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
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
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: { name: string }) => createApiKey(orgId, input),
		onSuccess: (...args) => {
			void invalidateApiKeyQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const invalidateApiKeyQueries = (client: QueryClient, orgId: string) =>
	client.invalidateQueries({ queryKey: apiKeysRootKey(orgId) });
