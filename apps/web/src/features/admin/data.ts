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
import { organizationsKey } from "@/features/organizations/data";
import { client, unwrap } from "@/lib/api";

import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export const freezeOrganization = (orgId: string) =>
	unwrap(client.api.admin.orgs[":orgId"].freeze.$post({ param: { orgId } }));

export function useFreezeOrganization(
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof freezeOrganization>>,
		string
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: string) => freezeOrganization(input),
		onSuccess: (...args) => {
			void invalidateAdminOrgQueries(queryClient);
			return callbacks?.onSuccess?.(...args);
		},
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
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: string) => unfreezeOrganization(input),
		onSuccess: (...args) => {
			void invalidateAdminOrgQueries(queryClient);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const ADMIN_PAGE_SIZE = 10;
export const adminOrgsRootKey = () => ["admin-orgs"] as const;
export const adminStatsKey = () => ["admin-stats"] as const;
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

export const adminOrgsKey = (page: number, search: string) =>
	[...adminOrgsRootKey(), page, search] as const;

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
