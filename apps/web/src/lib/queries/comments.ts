import type { ListCommentsDto } from "@api/dto/comment.dto";
import { client, unwrap } from "@/lib/api";

export const COMMENTS_PAGE_SIZE = 20;

export function commentsQueryKey(
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
		"comments",
	] as const;
}

export function fetchCommentsPage(
	orgId: string,
	projectId: string,
	issueNumber: number,
	page: number,
): Promise<ListCommentsDto> {
	return unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[
			":number"
		].comments.$get({
			param: { orgId, projectId, number: String(issueNumber) },
			query: { page: String(page), pageSize: String(COMMENTS_PAGE_SIZE) },
		}),
	);
}
