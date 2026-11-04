import type { Paginated } from "@workspace/shared";
import type { AttachmentWithUrlDto } from "./attachment.dto";

export type CommentAuthorDto = {
	id: string;
	name: string;
	email: string;
	image: string | null;
};

export type CommentReactionSummaryDto = {
	emoji: string;
	count: number;
	mine: boolean;
};

export type CommentDto = {
	id: string;
	orgId: string;
	issueId: string;
	/** Reply target; null for top-level comments. Replies are one level deep. */
	parentId: string | null;
	body: string;
	author: CommentAuthorDto;
	createdAt: string;
	updatedAt: string;
	resolvedAt: string | null;
	resolvedById: string | null;
	attachments: AttachmentWithUrlDto[];
	reactions: CommentReactionSummaryDto[];
	mentions: CommentAuthorDto[];
};

export type ListCommentsDto = Paginated<CommentDto>;

export type CommentReactionsDto = {
	commentId: string;
	reactions: CommentReactionSummaryDto[];
};
