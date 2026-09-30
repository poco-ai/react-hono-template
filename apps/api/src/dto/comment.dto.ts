import type { Paginated } from "@workspace/shared";

export type CommentAuthorDto = {
	id: string;
	name: string;
	email: string;
	image: string | null;
};

export type CommentDto = {
	id: string;
	orgId: string;
	issueId: string;
	body: string;
	author: CommentAuthorDto;
	createdAt: string;
	updatedAt: string;
};

export type ListCommentsDto = Paginated<CommentDto>;
