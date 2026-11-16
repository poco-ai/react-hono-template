import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { MANAGE_ROLES, membersQuery } from "./data";

/** beforeLoad guard for manage-only organization settings routes. */
export const requireManageRole = async ({
	queryClient,
	orgId,
	userId,
}: {
	queryClient: QueryClient;
	orgId: string;
	userId: string;
}) => {
	const members = await queryClient.ensureQueryData(membersQuery(orgId));
	const role = members.find((member) => member.userId === userId)?.role;
	if (!role || !(MANAGE_ROLES as string[]).includes(role)) {
		throw redirect({
			to: "/orgs/$orgId/settings",
			params: { orgId },
			search: { denied: true },
		});
	}
};
