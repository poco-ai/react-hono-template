import type { FavoriteItemDto } from "@api/dto/favorite.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	CreateFavoriteInput,
	FavoriteEntityType,
} from "@workspace/shared";
import { favoritesRootKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";
import {
	type OptimisticContext,
	optimisticUpdate,
	rollbackOptimistic,
} from "@/lib/optimistic";

export function favoritesQuery(orgId: string) {
	return queryOptions({
		queryKey: favoritesRootKey(orgId),
		queryFn: (): Promise<FavoriteItemDto[]> =>
			unwrap(client.api.orgs[":orgId"].favorites.$get({ param: { orgId } })),
	});
}

/** Whether a hydrated favorites list contains the given entity. */
export const isFavorited = (
	items: FavoriteItemDto[] | undefined,
	entityType: FavoriteEntityType,
	entityId: string,
) =>
	items?.some(
		(item) => item.entityType === entityType && item.entityId === entityId,
	) ?? false;

export const addFavorite = (orgId: string, input: CreateFavoriteInput) =>
	unwrap(
		client.api.orgs[":orgId"].favorites.$post({
			param: { orgId },
			json: input,
		}),
	);

export const removeFavorite = (
	orgId: string,
	entityType: FavoriteEntityType,
	entityId: string,
) =>
	unwrap(
		client.api.orgs[":orgId"].favorites[":entityType"][":entityId"].$delete({
			param: { orgId, entityType, entityId },
		}),
	);

export const invalidateFavoriteQueries = (
	queryClient: QueryClient,
	orgId: string,
) => queryClient.invalidateQueries({ queryKey: favoritesRootKey(orgId) });

/**
 * Optimistic placeholder for a newly added favorite. Only the identity fields
 * are known before the server hydrates the row, so it renders in neither
 * favorites section; `favoritesQuery` replaces it once the write settles.
 */
const optimisticFavorite = (
	orgId: string,
	entityType: FavoriteEntityType,
	entityId: string,
): FavoriteItemDto => ({
	id: `optimistic:${entityType}:${entityId}`,
	orgId,
	userId: "",
	entityType,
	entityId,
	createdAt: new Date().toISOString(),
	issue: null,
	project: null,
});

export function useRemoveFavorite(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof removeFavorite>>,
		{ entityType: FavoriteEntityType; entityId: string }
	>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: ({
			entityType,
			entityId,
		}: {
			entityType: FavoriteEntityType;
			entityId: string;
		}) => removeFavorite(orgId, entityType, entityId),
		onMutate: ({ entityType, entityId }) =>
			optimisticUpdate<FavoriteItemDto[]>(
				queryClient,
				favoritesRootKey(orgId),
				(old) =>
					old?.filter(
						(item) =>
							!(item.entityType === entityType && item.entityId === entityId),
					),
			),
		onError: (...args) => {
			rollbackOptimistic(
				queryClient,
				favoritesRootKey(orgId),
				args[2] as OptimisticContext<FavoriteItemDto[]> | undefined,
			);
			return callbacks?.onError?.(...args);
		},
		onSettled: (...args) => {
			void invalidateFavoriteQueries(queryClient, orgId);
			return callbacks?.onSettled?.(...args);
		},
	});
}

export interface ToggleFavoriteVariables {
	entityType: FavoriteEntityType;
	entityId: string;
	/** Current state; the toggle flips it. */
	favorited: boolean;
}

/** Star toggle: pins the entity when absent, unpins it when already present. */
export function useToggleFavorite(
	orgId: string,
	callbacks?: MutationCallbacks<
		{ favorited: boolean },
		ToggleFavoriteVariables
	>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: async ({
			entityType,
			entityId,
			favorited,
		}: ToggleFavoriteVariables) => {
			if (favorited) {
				await removeFavorite(orgId, entityType, entityId);
				return { favorited: false };
			}
			await addFavorite(orgId, { entityType, entityId });
			return { favorited: true };
		},
		onMutate: ({ entityType, entityId, favorited }) =>
			optimisticUpdate<FavoriteItemDto[]>(
				queryClient,
				favoritesRootKey(orgId),
				(old) => {
					if (!old) {
						return old;
					}
					if (favorited) {
						return old.filter(
							(item) =>
								!(item.entityType === entityType && item.entityId === entityId),
						);
					}
					return old.some(
						(item) =>
							item.entityType === entityType && item.entityId === entityId,
					)
						? old
						: [...old, optimisticFavorite(orgId, entityType, entityId)];
				},
			),
		onError: (...args) => {
			rollbackOptimistic(
				queryClient,
				favoritesRootKey(orgId),
				args[2] as OptimisticContext<FavoriteItemDto[]> | undefined,
			);
			return callbacks?.onError?.(...args);
		},
		onSettled: (...args) => {
			void invalidateFavoriteQueries(queryClient, orgId);
			return callbacks?.onSettled?.(...args);
		},
	});
}
