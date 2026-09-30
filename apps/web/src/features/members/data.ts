import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { invalidateOrganizationQueries } from "@/features/organizations/data";
import { authClient } from "@/lib/auth-client";
import { errorCode } from "@/lib/errors";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";

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

export function invitationsQuery(orgId: string) {
	return queryOptions({
		queryKey: invitationsKey(orgId),
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

export const updateMemberRole = async (
	orgId: string,
	{
		memberId,
		role,
	}: {
		memberId: string;
		role: OrgRole;
	},
	failureMessage: string,
) => {
	const { error } = await authClient.organization.updateMemberRole({
		organizationId: orgId,
		memberId,
		role,
	});
	if (error) {
		throw Object.assign(new Error(failureMessage), { code: errorCode(error) });
	}
};

export function useUpdateMemberRole(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof updateMemberRole>>,
		{
			memberId: string;
			role: OrgRole;
		}
	>,
) {
	const queryClient = useQueryClient();
	const { t } = useTranslation();
	return useMutation({
		...callbacks,
		mutationFn: (input: { memberId: string; role: OrgRole }) =>
			updateMemberRole(orgId, input, t("members.roleUpdateFailed")),
		onSuccess: (...args) => {
			void invalidateMemberQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const removeMember = async (
	orgId: string,
	memberId: string,
	failureMessage: string,
) => {
	const { error } = await authClient.organization.removeMember({
		organizationId: orgId,
		memberIdOrEmail: memberId,
	});
	if (error) {
		throw Object.assign(new Error(failureMessage), { code: errorCode(error) });
	}
};

export function useRemoveMember(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof removeMember>>,
		string
	>,
) {
	const queryClient = useQueryClient();
	const { t } = useTranslation();
	return useMutation({
		...callbacks,
		mutationFn: (input: string) =>
			removeMember(orgId, input, t("members.removeFailed")),
		onSuccess: (...args) => {
			void invalidateMemberQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const revokeInvitation = async (
	invitationId: string,
	failureMessage: string,
) => {
	const { error } = await authClient.organization.cancelInvitation({
		invitationId,
	});
	if (error) {
		throw Object.assign(new Error(failureMessage), { code: errorCode(error) });
	}
};

export function useRevokeInvitation(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof revokeInvitation>>,
		string
	>,
) {
	const queryClient = useQueryClient();
	const { t } = useTranslation();
	return useMutation({
		...callbacks,
		mutationFn: (input: string) =>
			revokeInvitation(input, t("members.revokeFailed")),
		onSuccess: (...args) => {
			void invalidateMemberQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const inviteMember = async (
	orgId: string,
	{ email, role }: { email: string; role: OrgRole },
	failureMessage: string,
) => {
	const { data, error } = await authClient.organization.inviteMember({
		organizationId: orgId,
		email: email.trim(),
		role,
	});
	if (error || !data) {
		throw Object.assign(new Error(error?.message ?? failureMessage), {
			code: errorCode(error),
		});
	}
	return data.id;
};

export function useInviteMember(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof inviteMember>>,
		{ email: string; role: OrgRole }
	>,
) {
	const queryClient = useQueryClient();
	const { t } = useTranslation();
	return useMutation({
		...callbacks,
		mutationFn: (input: { email: string; role: OrgRole }) =>
			inviteMember(orgId, input, t("members.inviteFailed")),
		onSuccess: (...args) => {
			void invalidateMemberQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const acceptInvitation = async (invitationId: string) => {
	const { error } = await authClient.organization.acceptInvitation({
		invitationId,
	});
	if (error) {
		throw Object.assign(new Error("invitation failed"), {
			code: errorCode(error),
		});
	}
};

export function useAcceptInvitation(
	invitationId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof acceptInvitation>>,
		void
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: () => acceptInvitation(invitationId),
		onSuccess: (...args) => {
			void invalidateOrganizationQueries(queryClient);
			return callbacks?.onSuccess?.(...args);
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
