import type { ProjectDto } from "@api/dto/project.dto";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { CreateProjectInput, UpdateProjectInput } from "@workspace/shared";
import { projectKey, projectsRootKey, roadmapRootKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";
import { useInvalidatingMutation } from "@/lib/feature-mutation";

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
	return useInvalidatingMutation({
		mutationFn: (input: ProjectDto) => archiveProject(orgId, input),
		invalidate: (queryClient) => invalidateProjectQueries(queryClient, orgId),
		callbacks,
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
	return useInvalidatingMutation({
		mutationFn: (input: CreateProjectInput) => createProject(orgId, input),
		invalidate: (queryClient) => invalidateProjectQueries(queryClient, orgId),
		callbacks,
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
	return useInvalidatingMutation({
		mutationFn: (input: { projectId: string; input: UpdateProjectInput }) =>
			updateProject(orgId, input),
		invalidate: (queryClient) => invalidateProjectQueries(queryClient, orgId),
		callbacks,
	});
}

export const invalidateProjectQueries = (client: QueryClient, orgId: string) =>
	Promise.all([
		client.invalidateQueries({ queryKey: projectsRootKey(orgId) }),
		// Project archive state, target dates and colors all render on the
		// roadmap, so keep the timeline in sync with project writes.
		client.invalidateQueries({ queryKey: roadmapRootKey(orgId) }),
	]);
