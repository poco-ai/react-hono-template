import type { LabelDto } from "@api/dto/label.dto";
import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "@/lib/api";

export function labelsQuery(orgId: string) {
	return queryOptions({
		queryKey: ["orgs", orgId, "labels"],
		queryFn: async (): Promise<LabelDto[]> =>
			unwrap(client.api.orgs[":orgId"].labels.$get({ param: { orgId } })),
	});
}
