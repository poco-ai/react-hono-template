import {
	type QueryClient,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";
import {
	applyOptimisticPatches,
	normalizeOptimisticPatches,
	type OptimisticPatches,
	type OptimisticRollbackPolicy,
	type OptimisticSnapshot,
	rollbackOptimisticPatches,
	shouldRollback,
} from "@/lib/optimistic";

/**
 * UI callbacks cannot replace the request, patch or rollback policy, so
 * `onMutate` (cancel → snapshot → patch) is owned by the hook and excluded.
 */
export type OptimisticMutationCallbacks<TData, TVariables> = Omit<
	MutationCallbacks<TData, TVariables>,
	"onMutate"
>;

/**
 * Mutation with the shared optimistic lifecycle: `onMutate` cancels in-flight
 * refetches, snapshots and patches every requested key; `onError` rolls the
 * snapshots back unless `rollbackOnError` opts out (bulk partial success);
 * `onSettled` runs the feature's `invalidate` before the caller's callbacks.
 */
export function useOptimisticMutation<TData, TVariables = void>({
	mutationFn,
	optimistic,
	invalidate,
	rollbackOnError,
	callbacks,
}: {
	mutationFn: (variables: TVariables) => Promise<TData>;
	optimistic?: (variables: TVariables) => OptimisticPatches;
	invalidate?: (
		client: QueryClient,
		variables: TVariables,
		data: TData | undefined,
	) => unknown;
	rollbackOnError?: OptimisticRollbackPolicy<TVariables>;
	callbacks?: OptimisticMutationCallbacks<TData, TVariables>;
}) {
	const queryClient = useQueryClient();

	return useMutation<TData, Error, TVariables, OptimisticSnapshot[]>({
		mutationFn,
		onMutate: async (variables) => {
			if (!optimistic) {
				return [];
			}
			const patches = await optimistic(variables);
			return applyOptimisticPatches(
				queryClient,
				normalizeOptimisticPatches(patches),
			);
		},
		onError: (error, variables, snapshots, context) => {
			if (shouldRollback(rollbackOnError, error, variables)) {
				rollbackOptimisticPatches(queryClient, snapshots);
			}
			return callbacks?.onError?.(error, variables, snapshots, context);
		},
		onSuccess: (data, variables, snapshots, context) =>
			callbacks?.onSuccess?.(data, variables, snapshots, context),
		onSettled: (data, error, variables, snapshots, context) => {
			void invalidate?.(queryClient, variables, data);
			return callbacks?.onSettled?.(data, error, variables, snapshots, context);
		},
	});
}
