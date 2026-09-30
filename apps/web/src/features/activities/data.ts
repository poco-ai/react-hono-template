import type { ActivityDto, OrgActivityDto } from "@api/dto/activity.dto";
import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "@/lib/api";

export const orgActivitiesRootKey = (orgId: string) =>
	["orgs", orgId, "activities"] as const;

export const issueActivitiesKey = (
	orgId: string,
	projectId: string,
	issueNumber: number,
) =>
	[
		"orgs",
		orgId,
		"projects",
		projectId,
		"issues",
		"detail",
		issueNumber,
		"activities",
	] as const;

export const ORG_ACTIVITY_PAGE_SIZE = 50;

export const ORG_ACTIVITY_MAX_LIMIT = 100;

export function issueActivitiesQuery(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	return queryOptions({
		queryKey: issueActivitiesKey(orgId, projectId, issueNumber),
		queryFn: (): Promise<ActivityDto[]> =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[
					":number"
				].activities.$get({
					param: { orgId, projectId, number: String(issueNumber) },
				}),
			),
	});
}

export function orgActivitiesQuery(
	orgId: string,
	{ projectId, limit }: { projectId?: string; limit: number },
) {
	return queryOptions({
		queryKey: orgActivitiesKey(orgId, { projectId, limit }),
		queryFn: (): Promise<OrgActivityDto[]> =>
			unwrap(
				client.api.orgs[":orgId"].activities.$get({
					param: { orgId },
					query: {
						projectId: projectId ?? undefined,
						limit: String(limit),
					},
				}),
			),
	});
}

export const orgActivitiesKey = (
	orgId: string,
	{ projectId, limit }: { projectId?: string; limit: number },
) =>
	[
		"orgs",
		orgId,
		"activities",
		{ projectId: projectId ?? null, limit },
	] as const;
