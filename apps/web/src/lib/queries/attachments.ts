import type { AttachmentWithUrlDto } from "@api/dto/attachment.dto";
import { queryOptions } from "@tanstack/react-query";
import { client, unwrap } from "@/lib/api";

export function attachmentsQueryKey(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	return [
		"orgs",
		orgId,
		"projects",
		projectId,
		"issues",
		"detail",
		issueNumber,
		"attachments",
	] as const;
}

export function attachmentsQuery(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	return queryOptions({
		queryKey: attachmentsQueryKey(orgId, projectId, issueNumber),
		queryFn: (): Promise<AttachmentWithUrlDto[]> =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[
					":number"
				].attachments.$get({
					param: { orgId, projectId, number: String(issueNumber) },
				}),
			),
	});
}
