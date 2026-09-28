import type { BillingDto } from "@api/dto/billing.dto";
import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "@/lib/api";

export function billingRootKey(orgId: string) {
	return ["orgs", orgId, "billing"] as const;
}

export function billingQuery(orgId: string) {
	return queryOptions({
		queryKey: ["orgs", orgId, "billing"] as const,
		queryFn: (): Promise<BillingDto> =>
			unwrap(client.api.orgs[":orgId"].billing.$get({ param: { orgId } })),
	});
}
