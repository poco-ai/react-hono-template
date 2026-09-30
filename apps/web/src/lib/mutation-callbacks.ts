import type { UseMutationOptions } from "@tanstack/react-query";

// UI callbacks cannot replace a feature's request or cache policy.
export type MutationCallbacks<TData, TVariables = void> = Pick<
	UseMutationOptions<TData, Error, TVariables>,
	"onSuccess" | "onError" | "onSettled" | "onMutate"
>;
