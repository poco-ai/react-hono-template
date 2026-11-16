import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth } from "@better-auth-ui/react";
import { useActiveMemberRole } from "@better-auth-ui/react/plugins/organization";
import { MANAGE_ROLES } from "@/features/members/data";

export function useOrgRole(orgId: string) {
	const { authClient } = useAuth<OrganizationAuthClient>();
	// The library invalidates this query after member role mutations.
	const memberRole = useActiveMemberRole(authClient, {
		query: { organizationId: orgId },
	});
	const role = memberRole.data?.role;
	const canManage =
		role !== undefined && (MANAGE_ROLES as readonly string[]).includes(role);
	return { role, canManage };
}
