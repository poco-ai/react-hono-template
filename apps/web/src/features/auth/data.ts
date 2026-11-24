import type { BootstrapDto } from "@api/core/dto/bootstrap.dto";
import { authMutationKeys } from "@better-auth-ui/core";
import { useRevokeSessions as useAuthRevokeSessions } from "@better-auth-ui/react";
import {
	matchMutation,
	type QueryClient,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { bootstrapKey, oauthProvidersKey, sessionKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { codedError, errorCode } from "@/lib/errors";
import { isMediaAssetUrl } from "@/lib/media";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";
import { imageContentType, uploadViaPresign } from "@/lib/upload";

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

class SessionLookupError extends Error {
	readonly status: number;
	readonly code: string | undefined;

	constructor(status: number, code: string | undefined, message: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

export const sessionOptions = queryOptions({
	queryKey: sessionKey(),
	queryFn: async ({ signal }) => {
		const { data, error } = await authClient.getSession({
			fetchOptions: { signal },
		});
		if (error) {
			// Better Auth uses 401 for an invalidated session, but can use the
			// same error code on 500. Only the status distinguishes the two.
			if (error.status === 401) return null;
			throw new SessionLookupError(
				error.status,
				error.code,
				error.message ?? "Could not load session",
			);
		}
		if (data === null) return null;
		if (
			!data?.session?.id ||
			!data.user?.id ||
			!Number.isFinite(new Date(data.session.expiresAt).getTime())
		) {
			throw new Error("Invalid session response");
		}
		return data;
	},
	// Reuse a successful check, but never use a locally expired session.
	staleTime: ({ state: { data, dataUpdatedAt } }) => {
		if (!data) return Infinity;
		const expiresAt = new Date(data.session.expiresAt).getTime();
		return Math.max(0, expiresAt - dataUpdatedAt);
	},
	// Match the app's retry bound, but classify Better Auth errors by HTTP
	// status rather than application API error codes.
	retry: (failureCount, error) =>
		failureCount < 3 &&
		(!(error instanceof SessionLookupError) ||
			error.status === 429 ||
			error.status >= 500),
});

/** Guard reads must await a new check when the cached result is stale. */
export function loadAppSession(queryClient: QueryClient) {
	return queryClient.fetchQuery(sessionOptions);
}

export function useSession() {
	return useQuery(sessionOptions);
}

/**
 * Better Auth UI updates its own cache on sign-in. Refresh the app cache
 * before navigating, without replacing the prior result with a false null.
 */
export async function refreshAppSession(queryClient: QueryClient) {
	const queryKey = sessionOptions.queryKey;
	await queryClient.cancelQueries({ queryKey, exact: true });
	await queryClient.invalidateQueries({
		queryKey,
		exact: true,
		refetchType: "none",
	});
	await loadAppSession(queryClient);
}

export async function uploadAvatar(file: File): Promise<string> {
	const contentType = imageContentType(file);
	const registered = await uploadViaPresign<{ url: string }>({
		file,
		contentType,
		presign: () =>
			client.api.me.avatar.presign.$post({
				json: {
					filename: file.name || `avatar.${contentType.split("/")[1]}`,
					contentType,
					size: file.size,
				},
			}),
		register: (key) => client.api.me.avatar.$post({ json: { key } }),
	});
	return registered.url;
}

export async function deleteAvatar(url: string): Promise<void> {
	// OAuth/legacy avatars are not media assets; there is nothing to delete.
	if (!isMediaAssetUrl(url)) return;
	try {
		await unwrap(client.api.me.avatar.$delete({ json: { url } }));
	} catch (error) {
		const code = errorCode(error);
		if (code === "ASSET_NOT_FOUND" || code === "VALIDATION") return;
		throw error;
	}
}

export async function signOut() {
	const { error } = await authClient.signOut();
	if (error) throw codedError(error.message ?? "", error.code);
}

/**
 * The header reads the app's `sessionKey()`, not the auth UI session query.
 * Refresh it after a profile update succeeds, including when
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

/** Refresh the app route-guard session after a library sign-in completes. */
export function useRefreshAppSession() {
	const queryClient = useQueryClient();
	return useCallback(() => refreshAppSession(queryClient), [queryClient]);
}

export function useRevokeAllAppSessions(onSuccess: () => void) {
	const queryClient = useQueryClient();
	return useAuthRevokeSessions(authClient, {
		onSuccess: () => {
			queryClient.clear();
			onSuccess();
		},
	});
}
