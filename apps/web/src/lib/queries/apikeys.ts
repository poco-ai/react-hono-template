import type { ListApiKeysDto } from "@api/dto/apikey.dto";
import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "@/lib/api";

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
