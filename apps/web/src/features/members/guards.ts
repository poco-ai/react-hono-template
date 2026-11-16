import { activeMemberRoleOptions } from "@better-auth-ui/core/plugins/organization";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { MANAGE_ROLES } from "./data";

/** beforeLoad guard for manage-only organization settings routes. */
export const requireManageRole = async ({
	queryClient,
	orgId,
}: {
	queryClient: QueryClient;
	orgId: string;
	userId: string;
}) => {
	const data = await queryClient.ensureQueryData(
		activeMemberRoleOptions(authClient, orgId, {
			query: { organizationId: orgId },
		}),
	);
	const role = data?.role;
	if (!role || !(MANAGE_ROLES as string[]).includes(role)) {
		throw redirect({
			to: "/orgs/$orgId/settings",
			params: { orgId },
			search: { denied: true },
		});
	}
};
