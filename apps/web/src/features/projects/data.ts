import type { ProjectDto } from "@api/dto/project.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { CreateProjectInput, UpdateProjectInput } from "@workspace/shared";
import { roadmapRootKey } from "@/features/roadmap/data";
import { client, unwrap } from "@/lib/api";

import type { MutationCallbacks } from "@/lib/mutation-callbacks";

export function projectQuery(orgId: string, projectId: string) {
	return queryOptions({
		queryKey: projectKey(orgId, projectId),
		queryFn: (): Promise<ProjectDto> =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].$get({
					param: { orgId, projectId },
				}),
			),
	});
}

export function projectsQuery(orgId: string) {
	return queryOptions({
		queryKey: projectsRootKey(orgId),
		queryFn: () =>
			unwrap(client.api.orgs[":orgId"].projects.$get({ param: { orgId } })),
	});
}

export const archiveProject = (orgId: string, project: ProjectDto) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].$patch({
			param: { orgId, projectId: project.id },
			json: { archived: !project.archived },
		}),
	);

export function useArchiveProject(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof archiveProject>>,
		ProjectDto
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: ProjectDto) => archiveProject(orgId, input),
		onSuccess: (...args) => {
			void invalidateProjectQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const createProject = (orgId: string, input: CreateProjectInput) =>
	unwrap(
		client.api.orgs[":orgId"].projects.$post({ param: { orgId }, json: input }),
	);

export function useCreateProject(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof createProject>>,
		CreateProjectInput
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: CreateProjectInput) => createProject(orgId, input),
		onSuccess: (...args) => {
			void invalidateProjectQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const updateProject = (
	orgId: string,
	{ projectId, input }: { projectId: string; input: UpdateProjectInput },
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].$patch({
			param: { orgId, projectId },
			json: input,
		}),
	);

export function useUpdateProject(
	orgId: string,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof updateProject>>,
		{ projectId: string; input: UpdateProjectInput }
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: { projectId: string; input: UpdateProjectInput }) =>
			updateProject(orgId, input),
		onSuccess: (...args) => {
			void invalidateProjectQueries(queryClient, orgId);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const projectsRootKey = (orgId: string) =>
	["orgs", orgId, "projects"] as const;
export const invalidateProjectQueries = (client: QueryClient, orgId: string) =>
	Promise.all([
		client.invalidateQueries({ queryKey: projectsRootKey(orgId) }),
		// Project archive state, target dates and colors all render on the
		// roadmap, so keep the timeline in sync with project writes.
		client.invalidateQueries({ queryKey: roadmapRootKey(orgId) }),
	]);

export const projectKey = (orgId: string, projectId: string) =>
	["orgs", orgId, "projects", projectId] as const;
