import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** One optimistic cache write: snapshot `queryKey`, then replace it with `update`. */
export type OptimisticPatch = {
	queryKey: QueryKey;
	update: (previous: unknown) => unknown;
};

/** Patch source produced by a mutation's `optimistic` callback. */
export type OptimisticPatches =
	| OptimisticPatch
	| readonly OptimisticPatch[]
	| Promise<OptimisticPatch | readonly OptimisticPatch[]>;

/** Cache value captured before the first patch was applied. */
export type OptimisticSnapshot = { queryKey: QueryKey; previous: unknown };

/**
 * Error policy for an optimistic mutation: `true` (default) rolls every
 * patched key back, `false` keeps the optimistic result (partial success), and
 * a predicate decides per error.
 */
export type OptimisticRollbackPolicy<TVariables> =
	| boolean
	| ((error: Error, variables: TVariables) => boolean);

/**
 * Typed patch builder. `update` receives the value currently cached under
 * `queryKey` (possibly `undefined`) and returns the optimistic replacement;
 * returning the argument unchanged is a no-op.
 */
export function optimisticPatch<T>(
	queryKey: QueryKey,
	update: (previous: T | undefined) => T | undefined,
): OptimisticPatch {
	return { queryKey, update: update as OptimisticPatch["update"] };
}

export function normalizeOptimisticPatches(
	patches: OptimisticPatch | readonly OptimisticPatch[],
): readonly OptimisticPatch[] {
	return Array.isArray(patches) ? patches : [patches as OptimisticPatch];
}

/**
 * Cancels in-flight refetches, snapshots every key and applies the patches in
 * order. All keys are snapshotted before the first write, so two patches for
 * the same key still roll back to the original value.
 */
export async function applyOptimisticPatches(
	client: QueryClient,
	patches: readonly OptimisticPatch[],
): Promise<OptimisticSnapshot[]> {
	await Promise.all(
		patches.map(({ queryKey }) => client.cancelQueries({ queryKey })),
	);
	const snapshots = patches.map(({ queryKey }) => ({
		queryKey,
		previous: client.getQueryData(queryKey),
	}));
	for (const { queryKey, update } of patches) {
		client.setQueryData<unknown>(queryKey, update);
	}
	return snapshots;
}

/** Restores every snapshotted key; keys that were not cached stay untouched. */
export function rollbackOptimisticPatches(
	client: QueryClient,
	snapshots: readonly OptimisticSnapshot[] | undefined,
) {
	for (const { queryKey, previous } of snapshots ?? []) {
		if (previous !== undefined) {
			client.setQueryData(queryKey, previous);
		}
	}
}

/** Resolves the mutation's rollback policy for one failure. */
export function shouldRollback<TVariables>(
	policy: OptimisticRollbackPolicy<TVariables> | undefined,
	error: Error,
	variables: TVariables,
): boolean {
	if (typeof policy === "function") {
		return policy(error, variables);
	}
	return policy ?? true;
}
