import type { Paginated } from "@workspace/shared";
import type { AttachmentWithUrlDto } from "./attachment.dto";

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
	attachments: AttachmentWithUrlDto[];
};

export type ListCommentsDto = Paginated<CommentDto>;
