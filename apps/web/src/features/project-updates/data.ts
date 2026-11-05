import type {
	ListProjectUpdatesDto,
	ProjectUpdateDto,
} from "@api/dto/project-update.dto";
import {
	infiniteQueryOptions,
	type QueryClient,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	CreateProjectUpdateInput,
	UpdateProjectUpdateInput,
} from "@workspace/shared";
import { projectsRootKey, projectUpdatesKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export type { ListProjectUpdatesDto, ProjectUpdateDto };

export const PROJECT_UPDATES_PAGE_SIZE = 20;

export function fetchProjectUpdatesPage(
	orgId: string,
	projectId: string,
	page: number,
): Promise<ListProjectUpdatesDto> {
	return unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].updates.$get({
			param: { orgId, projectId },
			query: {
				page: String(page),
				pageSize: String(PROJECT_UPDATES_PAGE_SIZE),
			},
		}),
	);
}

export function projectUpdatesQuery(orgId: string, projectId: string) {
	return infiniteQueryOptions({
		queryKey: projectUpdatesKey(orgId, projectId),
		queryFn: ({ pageParam }) =>
			fetchProjectUpdatesPage(orgId, projectId, pageParam),
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.page < Math.max(1, Math.ceil(lastPage.total / lastPage.pageSize))
				? lastPage.page + 1
				: undefined,
	});
}

export const createProjectUpdate = (
	orgId: string,
	projectId: string,
	input: CreateProjectUpdateInput,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].updates.$post({
			param: { orgId, projectId },
			json: input,
		}),
	);

export const updateProjectUpdate = (
	orgId: string,
	projectId: string,
	{ updateId, input }: { updateId: string; input: UpdateProjectUpdateInput },
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].updates[
			":updateId"
		].$patch({
			param: { orgId, projectId, updateId },
			json: input,
		}),
	);

export const deleteProjectUpdate = (
	orgId: string,
	projectId: string,
	updateId: string,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].updates[
			":updateId"
		].$delete({ param: { orgId, projectId, updateId } }),
	);

/**
 * Updates carry a health rollup, so a write refreshes the timeline and the
 * project caches (detail, list cards and issue statistics). The projects root
 * prefix covers all of them within the organization.
 */
export const invalidateProjectUpdateQueries = (
	queryClient: QueryClient,
	orgId: string,
	projectId: string,
) =>
	Promise.all([
		queryClient.invalidateQueries({
			queryKey: projectUpdatesKey(orgId, projectId),
		}),
		queryClient.invalidateQueries({ queryKey: projectsRootKey(orgId) }),
	]);

export function useCreateProjectUpdate(
	orgId: string,
	projectId: string,
	callbacks?: MutationCallbacks<ProjectUpdateDto, CreateProjectUpdateInput>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (input: CreateProjectUpdateInput) =>
			createProjectUpdate(orgId, projectId, input),
		onSuccess: (...args) => {
			void invalidateProjectUpdateQueries(queryClient, orgId, projectId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useUpdateProjectUpdate(
	orgId: string,
	projectId: string,
	callbacks?: MutationCallbacks<
		ProjectUpdateDto,
		{ updateId: string; input: UpdateProjectUpdateInput }
	>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (input: {
			updateId: string;
			input: UpdateProjectUpdateInput;
		}) => updateProjectUpdate(orgId, projectId, input),
		onSuccess: (...args) => {
			void invalidateProjectUpdateQueries(queryClient, orgId, projectId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export function useDeleteProjectUpdate(
	orgId: string,
	projectId: string,
	callbacks?: MutationCallbacks<{ deleted: boolean }, string>,
) {
	const queryClient = useQueryClient();
	return useMutation({
		...callbacks,
		mutationFn: (updateId: string) =>
			deleteProjectUpdate(orgId, projectId, updateId),
		onSuccess: (...args) => {
			void invalidateProjectUpdateQueries(queryClient, orgId, projectId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}
