import type {
	RoadmapCycleDto,
	RoadmapDto,
	RoadmapProjectDto,
} from "@api/dto/roadmap.dto";
import { queryOptions } from "@tanstack/react-query";
import { roadmapKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";

export type { RoadmapCycleDto, RoadmapDto, RoadmapProjectDto };

/**
 * Org roadmap aggregate. The API expands `from`/`to` to UTC day bounds and
 * clamps the window to 12 months; omit them for the default window (one month
 * back through five months ahead).
 */
export function roadmapQuery(orgId: string, from?: string, to?: string) {
	return queryOptions({
		queryKey: roadmapKey(orgId, from, to),
		queryFn: (): Promise<RoadmapDto> =>
			unwrap(
				client.api.orgs[":orgId"].roadmap.$get({
					param: { orgId },
					query: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
				}),
			),
	});
}
