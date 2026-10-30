import type { BootstrapDto } from "@api/dto/bootstrap.dto";
import { authMutationKeys } from "@better-auth-ui/core";
import {
	matchMutation,
	type QueryClient,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
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

/**
 * The route guards read `sessionKey()` with `staleTime: Infinity`. A sign-in
 * or sign-up that only updates Better Auth UI's own query still leaves that
 * cache empty, so `/` keeps rendering the signed-out landing page. Write the
 * fresh session in before navigating.
 */
export async function refreshAppSession(queryClient: QueryClient) {
	const { data } = await authClient.getSession();
	queryClient.setQueryData(sessionKey(), data ?? null);
}

export async function signOut() {
	const { error } = await authClient.signOut();
	if (error) throw codedError(error.message ?? "", error.code);
}

/**
 * The header reads `sessionKey()` with `staleTime: Infinity`, not the auth UI
 * session query. Refresh it after a profile update succeeds, including when
 * the account page has already unmounted.
 */
export function useRefreshSessionOnUserUpdate() {
	const queryClient = useQueryClient();
	useEffect(() => {
		return queryClient.getMutationCache().subscribe((event) => {
			if (event.type !== "updated" || event.action.type !== "success") return;
			if (
				!matchMutation(
					{ mutationKey: authMutationKeys.updateUser },
					event.mutation,
				)
			) {
				return;
			}
			void queryClient.invalidateQueries({ queryKey: sessionKey() });
		});
	}, [queryClient]);
}

export const oauthProvidersKey = () => ["oauth", "providers"] as const;

export function oauthProvidersQuery() {
	return queryOptions({
		queryKey: oauthProvidersKey(),
		queryFn: () => unwrap(client.api.oauth.providers.$get()),
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
