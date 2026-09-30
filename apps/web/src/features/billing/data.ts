import type { BillingDto } from "@api/dto/billing.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { organizationsKey } from "@/features/organizations/data";
import { client, unwrap } from "@/lib/api";

import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export function billingRootKey(orgId: string) {
	return ["orgs", orgId, "billing"] as const;
}

export function billingQuery(orgId: string) {
	return queryOptions({
		queryKey: billingRootKey(orgId),
		queryFn: (): Promise<BillingDto> =>
			unwrap(client.api.orgs[":orgId"].billing.$get({ param: { orgId } })),
	});
}

export const createCheckout = (orgId: string) =>
	unwrap(
		client.api.orgs[":orgId"].billing.checkout.$post({ param: { orgId } }),
	);

export function useCreateCheckout(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof createCheckout>>,
		void
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: () => createCheckout(orgId),
		onSuccess: (...args) => {
			if (!args[0].url) void invalidateBillingQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const createBillingPortal = (orgId: string) =>
	unwrap(client.api.orgs[":orgId"].billing.portal.$post({ param: { orgId } }));

export function useCreateBillingPortal(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof createBillingPortal>>,
		void
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: () => createBillingPortal(orgId),
		onSuccess: (...args) => {
			if (!args[0].url) void invalidateBillingQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const invalidateBillingQueries = (client: QueryClient, orgId: string) =>
	Promise.all([
		client.invalidateQueries({ queryKey: billingRootKey(orgId) }),
		client.invalidateQueries({ queryKey: organizationsKey(), exact: true }),
	]);
