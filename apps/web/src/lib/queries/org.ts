import { queryOptions } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export type Organization = (typeof authClient.$Infer)["Organization"];

export function orgsQuery() {
	return queryOptions({
		queryKey: ["orgs"],
		queryFn: async () => {
			const { data, error } = await authClient.organization.list();
			if (error) {
				throw new Error(
					`[${error.code ?? "error"}] ${error.message ?? "Failed to load organizations"}`,
				);
			}
			return data ?? [];
		},
	});
}
