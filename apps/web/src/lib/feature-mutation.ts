import {
	type QueryClient,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";

/**
 * Shared shape of a feature mutation: every write keeps its own `mutationFn`,
 * invalidates through the owning data module, and forwards the caller's UI
 * callbacks. `onSuccess` always invalidates before the caller's callback runs.
 */
export function useInvalidatingMutation<TData, TVariables = void>({
	mutationFn,
	invalidate,
	callbacks,
}: {
	mutationFn: (variables: TVariables) => Promise<TData>;
	invalidate?: (
		client: QueryClient,
		variables: TVariables,
		data: TData,
	) => unknown;
	callbacks?: MutationCallbacks<TData, TVariables>;
}) {
	const queryClient = useQueryClient();

	return useMutation<TData, Error, TVariables>({
		...callbacks,
		mutationFn,
		onSuccess: (...args) => {
			void invalidate?.(queryClient, args[1], args[0]);
			return callbacks?.onSuccess?.(...args);
		},
	});
}
