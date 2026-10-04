import type { BootstrapDto } from "@api/dto/bootstrap.dto";
import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { client, unwrap } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { codedError } from "@/lib/errors";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export function bootstrapQuery() {
	return queryOptions({
		queryKey: bootstrapKey(),
		queryFn: async (): Promise<BootstrapDto> =>
			unwrap(client.api.bootstrap.$get()),
	});
}

export type Session = NonNullable<
	Awaited<ReturnType<typeof authClient.getSession>>["data"]
>;

export type SessionUser = Session["user"];

export const sessionKey = () => ["session"] as const;
export const sessionOptions = queryOptions({
	queryKey: sessionKey(),
	queryFn: async () => {
		const { data } = await authClient.getSession();
		return data ?? null;
	},
	staleTime: Infinity,
});

export function useSession() {
	return useQuery(sessionOptions);
}

export async function signIn(input: { email: string; password: string }) {
	const { data, error } = await authClient.signIn.email(input);
	if (error) throw codedError(error.message ?? "", error.code);
	return data;
}

export async function signUp(input: {
	name: string;
	email: string;
	password: string;
}) {
	const { data, error } = await authClient.signUp.email(input);
	if (error) throw codedError(error.message ?? "", error.code);
	return data;
}

export async function signOut() {
	const { error } = await authClient.signOut();
	if (error) throw codedError(error.message ?? "", error.code);
}

export async function updateUserName(input: { name: string }) {
	const { data, error } = await authClient.updateUser({ name: input.name });
	if (error) throw codedError(error.message ?? "", error.code);
	return data;
}

export async function changePassword(input: {
	currentPassword: string;
	newPassword: string;
}) {
	const { data, error } = await authClient.changePassword({
		currentPassword: input.currentPassword,
		newPassword: input.newPassword,
		revokeOtherSessions: true,
	});
	if (error) throw codedError(error.message ?? "", error.code);
	return data;
}

export async function requestPasswordReset(input: {
	email: string;
	redirectTo: string;
}) {
	const { data, error } = await authClient.requestPasswordReset(input);
	if (error) throw codedError(error.message ?? "", error.code);
	return data;
}

export async function resetPassword(input: {
	newPassword: string;
	token: string;
}) {
	const { data, error } = await authClient.resetPassword(input);
	if (error) throw codedError(error.message ?? "", error.code);
	return data;
}

export function useSignIn(
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof signIn>>,
		Parameters<typeof signIn>[0]
	>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: signIn,
		onSuccess: (...args) => {
			queryClient.removeQueries({ queryKey: sessionOptions.queryKey });
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useSignUp(
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof signUp>>,
		Parameters<typeof signUp>[0]
	>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: signUp,
		onSuccess: (...args) => {
			queryClient.removeQueries({ queryKey: sessionOptions.queryKey });
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useSignOut(
	callbacks?: MutationCallbacks<Awaited<ReturnType<typeof signOut>>>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: signOut,
		onSuccess: (...args) => {
			queryClient.setQueryData(sessionOptions.queryKey, null);
			queryClient.clear();
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useUpdateUserName(
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof updateUserName>>,
		{ name: string }
	>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: updateUserName,
		onSuccess: (...args) => {
			void queryClient.invalidateQueries({
				queryKey: sessionOptions.queryKey,
			});
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useChangePassword(
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof changePassword>>,
		{ currentPassword: string; newPassword: string }
	>,
) {
	return useMutation({
		...callbacks,
		mutationFn: changePassword,
	});
}

export function useRequestPasswordReset(
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof requestPasswordReset>>,
		{ email: string; redirectTo: string }
	>,
) {
	return useMutation({
		...callbacks,
		mutationFn: requestPasswordReset,
	});
}

export function useResetPassword(
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof resetPassword>>,
		{ newPassword: string; token: string }
	>,
) {
	return useMutation({
		...callbacks,
		mutationFn: resetPassword,
	});
}

export type UserInvitation = NonNullable<
	Awaited<
		ReturnType<typeof authClient.organization.listUserInvitations>
	>["data"]
>[number];

export type PendingInvitation = UserInvitation & {
	/** The inviter is a member of the target organization; only the detail
	 * endpoint exposes their email alongside the invitation. */
	inviterEmail?: string;
};

export const userInvitationsKey = () => ["user-invitations"] as const;

/**
 * The first pending organization invitation for the signed-in user, or null.
 * Listing is a nicety for onboarding: callers fall back to the create-org form
 * when it fails or returns nothing.
 */
export function pendingInvitationQuery() {
	return queryOptions({
		queryKey: userInvitationsKey(),
		queryFn: async (): Promise<PendingInvitation | null> => {
			const { data, error } =
				await authClient.organization.listUserInvitations();
			if (error) throw codedError(error.message ?? "", error.code);
			const invitation = (data ?? []).find((item) => item.status === "pending");
			if (!invitation) return null;
			const detail = await authClient.organization.getInvitation({
				query: { id: invitation.id },
			});
			return { ...invitation, inviterEmail: detail.data?.inviterEmail };
		},
	});
}

export const bootstrapKey = () => ["bootstrap"] as const;
