import type { NotificationType } from "@workspace/shared";

/**
 * Ports: notification fan-out shapes consumed by issue/comment/recurrence
 * write paths.
 *
 * These structural types live in core so those services keep compiling when
 * the notifications feature is trimmed from a preset; `notification.service`
 * satisfies them structurally and is injected at assembly time. The method
 * signatures are hand-written copies of the service surface — do not import
 * the service module from here.
 */

/** Minimal issue view the fan-out needs (structural copy of NotificationIssue). */
export type NotifiableIssue = {
	id: string;
	orgId: string;
	number: number;
	assigneeId: string | null;
};

/**
 * Minimal actor view rendered on notifications (structural copy of the
 * comments feature's CommentAuthorDto; kept structural so notifications
 * compiles without a comments dependency).
 */
export type NotifiableActor = {
	id: string;
	name: string;
	email: string;
	image: string | null;
};

/** Shape used by issue create/update. */
export type IssueNotifications = {
	onIssueCreated: (
		issue: NotifiableIssue,
		actorId: string,
		options?: { notifyCreator?: boolean; type?: NotificationType },
	) => Promise<void>;
	onIssueUpdated: (input: {
		issue: NotifiableIssue;
		actorId: string;
		statusChanged: boolean;
		assignedUserId: string | null;
	}) => Promise<void>;
};

/** Shape used by comment create/resolve. */
export type CommentNotifications = {
	onCommentCreated: (input: {
		issue: NotifiableIssue;
		commentId: string;
		actorId: string;
		parentAuthorId?: string | null;
		mentionUserIds: string[];
		activityId?: string | null;
	}) => Promise<void>;
	onCommentResolved: (input: {
		issue: NotifiableIssue;
		commentId: string;
		authorId: string;
		actorId: string;
		activityId?: string | null;
	}) => Promise<void>;
	/** Comment deletion hook: nulls comment back-references (optional). */
	clearCommentReferences?: (
		orgId: string,
		commentIds: string[],
	) => Promise<void>;
};

/** Shape used by the recurrence cron. */
export type RecurrenceNotifications = {
	onRecurrenceCreated: (
		issue: NotifiableIssue,
		creatorId: string,
	) => Promise<void>;
};

/**
 * Notification fan-out is best-effort: a failure here must never fail the
 * write that triggered it (same contract as webhook dispatch). Errors are
 * logged instead of propagated.
 */
export const bestEffortNotification = async (
	label: string,
	run: () => Promise<void> | undefined,
): Promise<void> => {
	try {
		await run();
	} catch (error) {
		console.error(`[notifications] ${label} failed`, error);
	}
};
