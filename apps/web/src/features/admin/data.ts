import {
	banAdminUserOptions,
	createAdminUserOptions,
	impersonateAdminUserOptions,
	removeAdminUserOptions,
	revokeAdminUserSessionOptions,
	revokeAdminUserSessionsOptions,
	setAdminUserPasswordOptions,
	setAdminUserRoleOptions,
	unbanAdminUserOptions,
	updateAdminUserOptions,
} from "@better-auth-ui/core/plugins/admin";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import {
	adminOrgsKey,
	adminOrgsRootKey,
	adminQuotaKey,
	adminStatsKey,
	organizationsKey,
} from "@/features/keys";
import { client, unwrap } from "@/lib/api";
import { useInvalidatingMutation } from "@/lib/feature-mutation";

import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export const freezeOrganization = (orgId: string) =>
	unwrap(client.api.admin.orgs[":orgId"].freeze.$post({ param: { orgId } }));

export function useFreezeOrganization(
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof freezeOrganization>>,
		string
	>,
) {
	return useInvalidatingMutation({
		mutationFn: (input: string) => freezeOrganization(input),
		invalidate: (queryClient) => invalidateAdminOrgQueries(queryClient),
		callbacks,
	});
}

export const unfreezeOrganization = (orgId: string) =>
	unwrap(client.api.admin.orgs[":orgId"].freeze.$delete({ param: { orgId } }));

export function useUnfreezeOrganization(
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof unfreezeOrganization>>,
		string
	>,
) {
	return useInvalidatingMutation({
		mutationFn: (input: string) => unfreezeOrganization(input),
		invalidate: (queryClient) => invalidateAdminOrgQueries(queryClient),
		callbacks,
	});
}

export const ADMIN_PAGE_SIZE = 10;
export const invalidateAdminUserQueries = (client: QueryClient) =>
	Promise.all([client.invalidateQueries({ queryKey: adminStatsKey() })]);
export const invalidateAdminOrgQueries = (client: QueryClient) =>
	Promise.all([
		client.invalidateQueries({ queryKey: adminOrgsRootKey() }),
		client.invalidateQueries({ queryKey: adminStatsKey() }),
		client.invalidateQueries({ queryKey: organizationsKey(), exact: true }),
	]);

export function adminStatsQuery() {
	return queryOptions({
		queryKey: adminStatsKey(),
		queryFn: () => unwrap(client.api.admin.stats.$get()),
	});
}

export function adminOrganizationsQuery(page: number, search: string) {
	return queryOptions({
		queryKey: adminOrgsKey(page, search),
		queryFn: () =>
			unwrap(
				client.api.admin.orgs.$get({
					query: {
						page: String(page),
						pageSize: String(ADMIN_PAGE_SIZE),
						search,
					},
				}),
			),
	});
}

export function useAuthBanAdminUser(
	...args: Parameters<typeof banAdminUserOptions>
) {
	const queryClient = useQueryClient();
	const options = banAdminUserOptions(...args);
	return useMutation({
		...options,
		onSuccess: async () => {
			await invalidateAdminUserQueries(queryClient);
		},
	});
}

export function useCreateAdminUser(
	...args: Parameters<typeof createAdminUserOptions>
) {
	const queryClient = useQueryClient();
	const options = createAdminUserOptions(...args);
	return useMutation({
		...options,
		onSuccess: async () => {
			await invalidateAdminUserQueries(queryClient);
		},
	});
}

export function useImpersonateAdminUser(
	...args: Parameters<typeof impersonateAdminUserOptions>
) {
	const queryClient = useQueryClient();
	const options = impersonateAdminUserOptions(...args);
	return useMutation({
		...options,
		onSuccess: async () => {
			await invalidateAdminUserQueries(queryClient);
		},
	});
}

export function useRemoveAdminUser(
	...args: Parameters<typeof removeAdminUserOptions>
) {
	const queryClient = useQueryClient();
	const options = removeAdminUserOptions(...args);
	return useMutation({
		...options,
		onSuccess: async () => {
			await invalidateAdminUserQueries(queryClient);
		},
	});
}

export function useRevokeAdminUserSession(
	...args: Parameters<typeof revokeAdminUserSessionOptions>
) {
	const queryClient = useQueryClient();
	const options = revokeAdminUserSessionOptions(...args);
	return useMutation({
		...options,
		onSuccess: async () => {
			await invalidateAdminUserQueries(queryClient);
		},
	});
}

export function useRevokeAdminUserSessions(
	...args: Parameters<typeof revokeAdminUserSessionsOptions>
) {
	const queryClient = useQueryClient();
	const options = revokeAdminUserSessionsOptions(...args);
	return useMutation({
		...options,
		onSuccess: async () => {
			await invalidateAdminUserQueries(queryClient);
		},
	});
}

export function useSetAdminUserPassword(
	...args: Parameters<typeof setAdminUserPasswordOptions>
) {
	const queryClient = useQueryClient();
	const options = setAdminUserPasswordOptions(...args);
	return useMutation({
		...options,
		onSuccess: async () => {
			await invalidateAdminUserQueries(queryClient);
		},
	});
}

export function useSetAdminUserRole(
	...args: Parameters<typeof setAdminUserRoleOptions>
) {
	const queryClient = useQueryClient();
	const options = setAdminUserRoleOptions(...args);
	return useMutation({
		...options,
		onSuccess: async () => {
			await invalidateAdminUserQueries(queryClient);
		},
	});
}

export function useAuthUnbanAdminUser(
	...args: Parameters<typeof unbanAdminUserOptions>
) {
	const queryClient = useQueryClient();
	const options = unbanAdminUserOptions(...args);
	return useMutation({
		...options,
		onSuccess: async () => {
			await invalidateAdminUserQueries(queryClient);
		},
	});
}

export function adminQuotaQuery(orgId: string) {
	return queryOptions({
		queryKey: adminQuotaKey(orgId),
		queryFn: () =>
			unwrap(client.api.admin.orgs[":orgId"].quota.$get({ param: { orgId } })),
	});
}

export const adjustOrgCredits = (
	orgId: string,
	input: { amount: number; reason: string },
) =>
	unwrap(
		client.api.admin.orgs[":orgId"].credits.$post({
			param: { orgId },
			json: input,
		}),
	);

export function useAdjustOrgCredits(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof adjustOrgCredits>>,
		{ amount: number; reason: string }
	>,
) {
	return useInvalidatingMutation({
		mutationFn: (input: { amount: number; reason: string }) =>
			adjustOrgCredits(orgId, input),
		invalidate: (client) =>
			client.invalidateQueries({ queryKey: adminQuotaKey(orgId) }),
		callbacks,
	});
}

export const updateOrgQuotaPolicy = (
	orgId: string,
	input: {
		meter: "ai.tokens" | "storage.bytes";
		mode: "independent" | "pooled" | "hybrid";
		included: number;
		creditRate: number;
	},
) =>
	unwrap(
		client.api.admin.orgs[":orgId"].quota.$put({
			param: { orgId },
			json: input,
		}),
	);

export function useUpdateOrgQuotaPolicy(orgId: string) {
	return useInvalidatingMutation({
		mutationFn: (input: Parameters<typeof updateOrgQuotaPolicy>[1]) =>
			updateOrgQuotaPolicy(orgId, input),
		invalidate: (client) =>
			client.invalidateQueries({ queryKey: adminQuotaKey(orgId) }),
	});
}

export function useUpdateAdminUser(
	...args: Parameters<typeof updateAdminUserOptions>
) {
	const queryClient = useQueryClient();
	const options = updateAdminUserOptions(...args);
	return useMutation({
		...options,
		onSuccess: async () => {
			await invalidateAdminUserQueries(queryClient);
		},
	});
}
