import type { NotificationType, Paginated } from "@workspace/shared";
import type { CommentAuthorDto } from "./comment.dto";

export type NotificationDto = {
	id: string;
	orgId: string;
	type: NotificationType;
	issueId: string;
	commentId: string | null;
	/** Plain-text preview of the related comment (null for non-comment events). */
	commentExcerpt: string | null;
	activityId: string | null;
	readAt: string | null;
	createdAt: string;
	actor: CommentAuthorDto | null;
	issue: {
		id: string;
		number: number;
		title: string;
		projectId: string;
	};
	project: { id: string; key: string; name: string };
};

export type NotificationListDto = Paginated<NotificationDto> & {
	unread: number;
};

export type NotificationUnreadCountDto = {
	unread: number;
};
