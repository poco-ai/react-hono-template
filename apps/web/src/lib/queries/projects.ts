import type { ProjectDto } from "@api/dto/project.dto";
import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "@/lib/api";

export function projectQuery(orgId: string, projectId: string) {
	return queryOptions({
		queryKey: ["orgs", orgId, "projects", projectId],
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
		queryKey: ["orgs", orgId, "projects"],
		queryFn: () =>
			unwrap(client.api.orgs[":orgId"].projects.$get({ param: { orgId } })),
	});
}
