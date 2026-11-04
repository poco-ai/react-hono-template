import type { OrganizationTeamsAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useInviteMember as useInviteMemberBase } from "@better-auth-ui/react/plugins/organization";
import {
	type QueryClient,
	queryOptions,
	useQueryClient,
} from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export type OrgMember = NonNullable<
	Awaited<ReturnType<typeof authClient.organization.listMembers>>["data"]
>["members"][number];

export type OrgRole = "owner" | "admin" | "member";

export const MANAGE_ROLES: OrgRole[] = ["owner", "admin"];

export function membersQuery(orgId: string) {
	return queryOptions({
		queryKey: membersKey(orgId),
		queryFn: async () => {
			const { data, error } = await authClient.organization.listMembers({
				query: { organizationId: orgId },
			});
			if (error) {
				throw new Error(
					`[${error.code ?? "error"}] ${error.message ?? "Failed to load members"}`,
				);
			}
			return data?.members ?? [];
		},
	});
}

export const membersKey = (orgId: string) =>
	["orgs", orgId, "members"] as const;
export const invitationsKey = (orgId: string) =>
	["orgs", orgId, "invitations"] as const;
export const invalidateMemberQueries = (client: QueryClient, orgId: string) =>
	Promise.all([
		client.invalidateQueries({ queryKey: membersKey(orgId) }),
		client.invalidateQueries({ queryKey: invitationsKey(orgId) }),
	]);

/**
 * Wraps the Better Auth UI invite mutation with the members cache policy:
 * member and invitation lists refresh after every successful invite.
 */
export function useInviteMember(
	orgId: string | undefined,
	onInvited?: (invitation: { id: string; email: string }) => void,
) {
	const queryClient = useQueryClient();
	return useInviteMemberBase(
		// The app does not enable the teams plugin; the invite mutation only
		// needs organization.inviteMember, so the teams-typed cast is safe.
		authClient as unknown as OrganizationTeamsAuthClient,
		{
			onSuccess: (invitation) => {
				if (orgId) {
					void invalidateMemberQueries(queryClient, orgId);
				}
				onInvited?.(invitation);
			},
		},
	);
}
