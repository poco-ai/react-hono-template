/**
 * Port: attachment lookup surface consumed by comment workflows.
 *
 * The type lives in core so `comment.service` keeps compiling when the
 * attachments feature is trimmed from a preset (comments degrade to plain
 * text). `attachment.service` satisfies it structurally and is injected at
 * assembly time.
 */

/**
 * Structural copy of `AttachmentWithUrlDto` (dto/attachment.dto). Keep the
 * fields in sync: the comment DTO's `attachments` field is typed with the
 * original, and structural identity is what makes the port work without
 * importing the attachments dto.
 */
export type AttachmentFileSummary = {
	id: string;
	orgId: string;
	issueId: string;
	commentId: string | null;
	key: string;
	filename: string;
	contentType: string;
	size: number;
	uploader: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
	createdAt: string;
	url: string | null;
};

/** Attachment surface comments consume (list decoration + object cleanup). */
export type AttachmentFileLookup = {
	forComments: (
		orgId: string,
		commentIds: string[],
	) => Promise<Map<string, AttachmentFileSummary[]>>;
	/** Storage keys for a comment and its replies; read before deleting rows. */
	keysForComment: (orgId: string, commentId: string) => Promise<string[]>;
	/**
	 * Deletes the attachment rows of a comment thread. Comments call this
	 * before removing the comments so D1's explicit child deletes still happen
	 * when the attachments slice is enabled.
	 */
	deleteCommentThreadRows: (orgId: string, commentId: string) => Promise<void>;
	/** Best-effort object removal; call only after the rows are gone. */
	removeObjects: (keys: string[]) => Promise<void>;
};
