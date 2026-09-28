import { queryOptions } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export type OrgMember = NonNullable<
	Awaited<ReturnType<typeof authClient.organization.listMembers>>["data"]
>["members"][number];

export type OrgInvitation = NonNullable<
	Awaited<ReturnType<typeof authClient.organization.listInvitations>>["data"]
>[number];

export type OrgRole = "owner" | "admin" | "member";

export const ORG_ROLES: OrgRole[] = ["owner", "admin", "member"];

export const MANAGE_ROLES: OrgRole[] = ["owner", "admin"];

export function membersQuery(orgId: string) {
	return queryOptions({
		queryKey: ["orgs", orgId, "members"],
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

export function invitationsQuery(orgId: string) {
	return queryOptions({
		queryKey: ["orgs", orgId, "invitations"],
		queryFn: async () => {
			const { data, error } = await authClient.organization.listInvitations({
				query: { organizationId: orgId },
			});
			if (error) {
				throw new Error(
					`[${error.code ?? "error"}] ${error.message ?? "Failed to load invitations"}`,
				);
			}
			return data ?? [];
		},
	});
}
