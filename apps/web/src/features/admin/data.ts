import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { organizationsKey } from "@/features/organizations/data";
import { client, unwrap } from "@/lib/api";

import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export const updateAdminUserRole = ({
	id,
	role,
}: {
	id: string;
	role: "admin" | "user";
}) =>
	unwrap(
		client.api.admin.users[":id"].role.$patch({
			param: { id },
			json: { role },
		}),
	);

export function useUpdateAdminUserRole(
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof updateAdminUserRole>>,
		{ id: string; role: "admin" | "user" }
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: { id: string; role: "admin" | "user" }) =>
			updateAdminUserRole(input),
		onSuccess: (...args) => {
			void invalidateAdminUserQueries(queryClient);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const banAdminUser = (id: string) =>
	unwrap(client.api.admin.users[":id"].ban.$post({ param: { id }, json: {} }));

export function useBanAdminUser(
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof banAdminUser>>,
		string
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: string) => banAdminUser(input),
		onSuccess: (...args) => {
			void invalidateAdminUserQueries(queryClient);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const unbanAdminUser = (id: string) =>
	unwrap(client.api.admin.users[":id"].ban.$delete({ param: { id } }));

export function useUnbanAdminUser(
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof unbanAdminUser>>,
		string
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: string) => unbanAdminUser(input),
		onSuccess: (...args) => {
			void invalidateAdminUserQueries(queryClient);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

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
export const adminUsersRootKey = () => ["admin-users"] as const;
export const adminOrgsRootKey = () => ["admin-orgs"] as const;
export const adminStatsKey = () => ["admin-stats"] as const;
export const invalidateAdminUserQueries = (client: QueryClient) =>
	Promise.all([
		client.invalidateQueries({ queryKey: adminUsersRootKey() }),
		client.invalidateQueries({ queryKey: adminStatsKey() }),
	]);
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

export function adminUsersQuery(page: number, search: string) {
	return queryOptions({
		queryKey: adminUsersKey(page, search),
		queryFn: () =>
			unwrap(
				client.api.admin.users.$get({
					query: {
						page: String(page),
						pageSize: String(ADMIN_PAGE_SIZE),
						search,
					},
				}),
			),
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

export const adminUsersKey = (page: number, search: string) =>
	[...adminUsersRootKey(), page, search] as const;
export const adminOrgsKey = (page: number, search: string) =>
	[...adminOrgsRootKey(), page, search] as const;
