/**
 * Command-palette search results. Every section is independently capped by the
 * requested limit. Member hits never expose email addresses even though email
 * is part of the match; comments carry their issue reference so the client can
 * navigate to `#comment-<id>`.
 */
export type SearchResultUserDto = {
	id: string;
	name: string;
	image: string | null;
};

export type SearchIssueHitDto = {
	id: string;
	projectId: string;
	projectKey: string;
	number: number;
	/** Human-readable reference, e.g. `WEB-12`. */
	identifier: string;
	title: string;
	descriptionExcerpt: string | null;
	statusId: string;
	statusName: string;
	statusColor: string;
	statusCategory: string;
	priority: number;
	assignee: SearchResultUserDto | null;
	updatedAt: string;
};

export type SearchCommentHitDto = {
	id: string;
	/** Body excerpt (whitespace collapsed, length-capped). */
	body: string;
	author: SearchResultUserDto;
	issue: {
		id: string;
		projectId: string;
		projectKey: string;
		number: number;
		identifier: string;
		title: string;
	};
	createdAt: string;
};

export type SearchProjectHitDto = {
	id: string;
	name: string;
	key: string;
	descriptionExcerpt: string | null;
	color: string | null;
	archived: boolean;
	updatedAt: string;
};

export type SearchMemberHitDto = {
	id: string;
	name: string;
	image: string | null;
};

export type SearchResultsDto = {
	issues: SearchIssueHitDto[];
	comments: SearchCommentHitDto[];
	projects: SearchProjectHitDto[];
	members: SearchMemberHitDto[];
};
