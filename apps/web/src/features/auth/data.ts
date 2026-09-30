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

export const bootstrapKey = () => ["bootstrap"] as const;
