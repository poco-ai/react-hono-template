import type { ViewDto } from "@api/dto/view.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { CreateViewInput, UpdateViewInput } from "@workspace/shared";
import { invalidateIssueQueries } from "@/features/issues/data";
import { viewsKey, viewsRootKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export type { ViewDto };

/**
 * Saved views for the current user plus every shared view in the organization.
 * Project views are cached under the project-specific key; the org-level key
 * covers organization-wide views.
 */
export function viewsQuery(orgId: string, projectId?: string) {
	return queryOptions({
		queryKey: viewsKey(orgId, projectId),
		queryFn: async (): Promise<ViewDto[]> =>
			unwrap(
				client.api.orgs[":orgId"].views.$get({
					param: { orgId },
					query: projectId ? { projectId } : {},
				}),
			),
	});
}

export const createView = (orgId: string, input: CreateViewInput) =>
	unwrap(
		client.api.orgs[":orgId"].views.$post({
			param: { orgId },
			json: input,
		}),
	);

export const updateView = (
	orgId: string,
	viewId: string,
	input: UpdateViewInput,
) =>
	unwrap(
		client.api.orgs[":orgId"].views[":viewId"].$patch({
			param: { orgId, viewId },
			json: input,
		}),
	);

export const deleteView = (orgId: string, viewId: string) =>
	unwrap(
		client.api.orgs[":orgId"].views[":viewId"].$delete({
			param: { orgId, viewId },
		}),
	);

export const setDefaultView = (orgId: string, viewId: string) =>
	unwrap(
		client.api.orgs[":orgId"].views[":viewId"].default.$put({
			param: { orgId, viewId },
		}),
	);

export const clearDefaultView = (orgId: string, viewId: string) =>
	unwrap(
		client.api.orgs[":orgId"].views[":viewId"].default.$delete({
			param: { orgId, viewId },
		}),
	);

/**
 * View writes always refresh the view lists. Applied views drive issue lists,
 * so sharing/updating/deleting a view also refreshes issue caches; changing
 * only the default view does not change any issue result.
 */
export const invalidateViewQueries = (
	queryClient: QueryClient,
	orgId: string,
	{ issues = true }: { issues?: boolean } = {},
) =>
	Promise.all([
		queryClient.invalidateQueries({ queryKey: viewsRootKey(orgId) }),
		...(issues ? [invalidateIssueQueries(queryClient, orgId)] : []),
	]);

export function useCreateView(
	orgId: string,
	callbacks?: MutationCallbacks<ViewDto, CreateViewInput>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (input: CreateViewInput) => createView(orgId, input),
		onSuccess: (...args) => {
			void invalidateViewQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useUpdateView(
	orgId: string,
	viewId: string,
	callbacks?: MutationCallbacks<ViewDto, UpdateViewInput>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (input: UpdateViewInput) => updateView(orgId, viewId, input),
		onSuccess: (...args) => {
			void invalidateViewQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useDeleteView(
	orgId: string,
	callbacks?: MutationCallbacks<{ deleted: boolean }, string>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (viewId: string) => deleteView(orgId, viewId),
		onSuccess: (...args) => {
			void invalidateViewQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useSetDefaultView(
	orgId: string,
	callbacks?: MutationCallbacks<ViewDto, string>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (viewId: string) => setDefaultView(orgId, viewId),
		onSuccess: (...args) => {
			void invalidateViewQueries(queryClient, orgId, { issues: false });
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useClearDefaultView(
	orgId: string,
	callbacks?: MutationCallbacks<{ cleared: boolean }, string>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (viewId: string) => clearDefaultView(orgId, viewId),
		onSuccess: (...args) => {
			void invalidateViewQueries(queryClient, orgId, { issues: false });
			return callbacks?.onSuccess?.(...args);
		},
	});
}
