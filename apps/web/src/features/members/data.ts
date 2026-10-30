import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { codedError, errorCode } from "@/lib/errors";

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

export const inviteMember = async (
	orgId: string,
	{ email, role }: { email: string; role: OrgRole },
) => {
	const { data, error } = await authClient.organization.inviteMember({
		organizationId: orgId,
		email: email.trim(),
		role,
	});
	if (error || !data) {
		throw codedError(error?.message ?? "", errorCode(error));
	}
	return data.id;
};

export const membersKey = (orgId: string) =>
	["orgs", orgId, "members"] as const;
export const invitationsKey = (orgId: string) =>
	["orgs", orgId, "invitations"] as const;
export const invalidateMemberQueries = (client: QueryClient, orgId: string) =>
	Promise.all([
		client.invalidateQueries({ queryKey: membersKey(orgId) }),
		client.invalidateQueries({ queryKey: invitationsKey(orgId) }),
	]);
