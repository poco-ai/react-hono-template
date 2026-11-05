import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Rollback payload for one optimistically patched query key. */
export type OptimisticContext<T> = { previous: T | undefined };

/** Cancel in-flight refetches and capture the current cache for rollback. */
async function optimisticSnapshot<T>(
	client: QueryClient,
	queryKey: QueryKey,
): Promise<OptimisticContext<T>> {
	await client.cancelQueries({ queryKey });
	return { previous: client.getQueryData<T>(queryKey) };
}

/** Snapshot, then apply the feature's patch. The patch itself stays local. */
export async function optimisticUpdate<T>(
	client: QueryClient,
	queryKey: QueryKey,
	updater: (previous: T | undefined) => T | undefined,
): Promise<OptimisticContext<T>> {
	const context = await optimisticSnapshot<T>(client, queryKey);
	client.setQueryData<T>(queryKey, updater);
	return context;
}

/** Restore the snapshot captured by either helper above. */
export function rollbackOptimistic<T>(
	client: QueryClient,
	queryKey: QueryKey,
	context: OptimisticContext<T> | undefined,
) {
	if (context?.previous !== undefined) {
		client.setQueryData(queryKey, context.previous);
	}
}
