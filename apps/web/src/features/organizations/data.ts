import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export type Organization = (typeof authClient.$Infer)["Organization"] & {
	frozen: boolean;
};

export function orgsQuery() {
	return queryOptions({
		queryKey: organizationsKey(),
		queryFn: async (): Promise<Organization[]> => {
			const { data, error } = await authClient.organization.list();
			if (error) {
				throw new Error(
					`[${error.code ?? "error"}] ${error.message ?? "Failed to load organizations"}`,
				);
			}
			return (data ?? []).map((org) => ({
				...org,
				frozen: Boolean((org as { frozen?: boolean }).frozen),
			}));
		},
	});
}

export const organizationsKey = () => ["orgs"] as const;

/**
 * Reloads the app organization list after a better-auth organization write.
 * Callers navigate immediately afterwards, and the org route reads this cache.
 */
export function useRefreshOrganizations() {
	const queryClient = useQueryClient();
	return () => queryClient.fetchQuery(orgsQuery());
}
