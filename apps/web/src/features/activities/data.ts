import type { ActivityDto, OrgActivityDto } from "@api/dto/activity.dto";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { issueActivitiesKey, orgActivitiesKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";

/** Rows fetched per "load more" step of the organization feed. */
export const ORG_ACTIVITY_PAGE_SIZE = 30;

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

export function fetchOrgActivities(
	orgId: string,
	{
		projectId,
		offset,
		limit = ORG_ACTIVITY_PAGE_SIZE,
	}: { projectId?: string; offset: number; limit?: number },
) {
	return unwrap(
		client.api.orgs[":orgId"].activities.$get({
			param: { orgId },
			query: {
				projectId: projectId ?? undefined,
				limit: String(limit),
				offset: String(offset),
			},
		}),
	) as Promise<OrgActivityDto[]>;
}

/** Offset-paged organization feed; the next page starts after the last row. */
export function orgActivitiesInfiniteQuery(
	orgId: string,
	{ projectId }: { projectId?: string } = {},
) {
	return infiniteQueryOptions({
		queryKey: orgActivitiesKey(orgId, { projectId }),
		initialPageParam: 0,
		queryFn: ({ pageParam }) =>
			fetchOrgActivities(orgId, { projectId, offset: pageParam }),
		// A short page (or an empty one) means there is nothing left to fetch.
		getNextPageParam: (lastPage, _pages, lastPageParam) =>
			lastPage.length === ORG_ACTIVITY_PAGE_SIZE
				? lastPageParam + ORG_ACTIVITY_PAGE_SIZE
				: undefined,
	});
}

/**
 * Flattens infinite pages into one list. Overlapping rows (two page fetches
 * that both saw the same activity) are dropped, first occurrence wins, so the
 * rendered list keeps a stable order and unique React keys.
 */
export const flattenActivityPages = (
	pages: OrgActivityDto[][] | undefined,
): OrgActivityDto[] => {
	if (!pages) {
		return [];
	}
	const seen = new Set<string>();
	const items: OrgActivityDto[] = [];
	for (const activity of pages.flat()) {
		if (seen.has(activity.id)) {
			continue;
		}
		seen.add(activity.id);
		items.push(activity);
	}
	return items;
};
