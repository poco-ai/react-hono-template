import {
	ApiError,
	ApiErrorCode,
	type IssueSubscriptionReason,
	type NotificationFilter,
	type NotificationType,
} from "@workspace/shared";
import type { IssueSubscriptionDao } from "../dao/issue-subscription.dao";
import type {
	NotificationDao,
	NotificationInsert,
} from "../dao/notification.dao";
import type { NotificationListDto } from "../dto/notification.dto";

/** Minimal issue view the fan-out needs; avoids importing the full DTO. */
export type NotificationIssue = {
	id: string;
	orgId: string;
	number: number;
	assigneeId: string | null;
};

type RecipientPriority = {
	type: NotificationType;
	priority: number;
};

const PRIORITY: Record<NotificationType, number> = {
	issue_assigned: 1,
	issue_status_changed: 1,
	issue_commented: 1,
	comment_reply: 2,
	comment_mention: 3,
	comment_resolved: 1,
	// Same level as assignment: a recurring issue is created *and* assigned.
	recurring_issue_created: 1,
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

/**
 * Personal inbox plus the issue/comment notification fan-out.
 *
 * Ownership model: every inbox read/write filters on both orgId and userId, so
 * a notification id from another user or organization answers 404.
 *
 * Fan-out rules:
 * - Recipients are the issue subscribers (minus muted ones), the reply parent
 *   author, and valid mentions; the actor never notifies themselves.
 * - One recipient gets one notification, preferring mention > reply > comment
 *   (and assignment over a concurrent status change).
 * - Subscriptions created by the event land in the same D1 batch as the
 *   notifications; recipients are resolved with one query, never per user.
 */
export const createNotificationService = ({
	notificationDao,
	subscriptionDao,
}: {
	notificationDao: NotificationDao;
	subscriptionDao: IssueSubscriptionDao;
}) => {
	const buildRow = ({
		orgId,
		userId,
		type,
		issueId,
		commentId,
		activityId,
		actorId,
	}: {
		orgId: string;
		userId: string;
		type: NotificationType;
		issueId: string;
		commentId?: string | null;
		activityId?: string | null;
		actorId: string | null;
	}): NotificationInsert => ({
		id: crypto.randomUUID(),
		orgId,
		userId,
		type,
		issueId,
		commentId: commentId ?? null,
		activityId: activityId ?? null,
		actorId,
		readAt: null,
	});

	/** Resolves recipient priorities; muted users are dropped by the caller. */
	const setRecipient = (
		recipients: Map<string, RecipientPriority>,
		userId: string,
		type: NotificationType,
	) => {
		const current = recipients.get(userId);
		if (!current || PRIORITY[type] > current.priority) {
			recipients.set(userId, { type, priority: PRIORITY[type] });
		}
	};

	/**
	 * Subscribes the creator and the initial assignee. When the assignee is
	 * someone other than the creator they are also notified right away, in
	 * the same transaction as the subscriptions.
	 *
	 * `notifyCreator` adds a notification for the creator themselves (used by
	 * the recurrence cron, where the "actor" is the recurrence owner and no
	 * request user is present). Recipients are deduplicated by user id with the
	 * higher priority type winning, so a creator who is also the assignee gets
	 * exactly one row.
	 */
	const onIssueCreated = async (
		issue: NotificationIssue,
		actorId: string,
		options: { notifyCreator?: boolean; type?: NotificationType } = {},
	) => {
		const subscriptions: {
			orgId: string;
			issueId: string;
			userId: string;
			reason: IssueSubscriptionReason;
		}[] = [];
		if (actorId) {
			subscriptions.push({
				orgId: issue.orgId,
				issueId: issue.id,
				userId: actorId,
				reason: "creator",
			});
		}
		if (issue.assigneeId && issue.assigneeId !== actorId) {
			subscriptions.push({
				orgId: issue.orgId,
				issueId: issue.id,
				userId: issue.assigneeId,
				reason: "assignee",
			});
		}
		const recipients = new Map<string, RecipientPriority>();
		if (options.notifyCreator && actorId) {
			setRecipient(
				recipients,
				actorId,
				options.type ?? "recurring_issue_created",
			);
		}
		if (issue.assigneeId && issue.assigneeId !== actorId) {
			setRecipient(recipients, issue.assigneeId, "issue_assigned");
		}
		await notificationDao.createMany(
			[...recipients].map(([userId, { type }]) =>
				buildRow({
					orgId: issue.orgId,
					userId,
					type,
					issueId: issue.id,
					actorId: actorId || null,
				}),
			),
			subscriptions,
		);
	};

	return {
		listInbox: (
			orgId: string,
			userId: string,
			query: {
				filter: NotificationFilter;
				page: number;
				pageSize: number;
			},
		): Promise<NotificationListDto> =>
			notificationDao.listByUser(orgId, userId, query),

		unreadCount: (orgId: string, userId: string): Promise<number> =>
			notificationDao.countUnread(orgId, userId),

		markRead: async (
			orgId: string,
			userId: string,
			id: string,
		): Promise<{ id: string; readAt: string }> => {
			const readAt = new Date();
			const updated = await notificationDao.markRead(orgId, userId, id, readAt);
			if (!updated) {
				throw new ApiError(
					ApiErrorCode.NOTIFICATION_NOT_FOUND,
					`Notification ${id} not found`,
				);
			}
			return { id, readAt: readAt.toISOString() };
		},

		markAllRead: async (
			orgId: string,
			userId: string,
		): Promise<{ updated: number; unread: 0 }> => ({
			updated: await notificationDao.markAllRead(orgId, userId, new Date()),
			unread: 0,
		}),

		delete: async (orgId: string, userId: string, id: string) => {
			const deleted = await notificationDao.delete(orgId, userId, id);
			if (!deleted) {
				throw new ApiError(
					ApiErrorCode.NOTIFICATION_NOT_FOUND,
					`Notification ${id} not found`,
				);
			}
		},

		onIssueCreated,

		/**
		 * Cron fan-out for a materialized recurring issue: the recurrence owner
		 * is notified even though they are the actor, and the assignee keeps the
		 * normal assignment notification.
		 */
		onRecurrenceCreated: (issue: NotificationIssue, creatorId: string) =>
			onIssueCreated(issue, creatorId, {
				notifyCreator: true,
				type: "recurring_issue_created",
			}),

		/**
		 * Fans out a status change to every subscriber and notifies a newly
		 * assigned member (auto-subscribing them as assignee). Assigning
		 * yourself still records the subscription, but never a notification.
		 */
		onIssueUpdated: async ({
			issue,
			actorId,
			statusChanged,
			assignedUserId,
		}: {
			issue: NotificationIssue;
			actorId: string;
			statusChanged: boolean;
			assignedUserId: string | null;
		}) => {
			// `assignedUserId` drives the subscription (self-assignment counts);
			// `notifyUserId` drives the notification (never the actor).
			const notifyUserId =
				assignedUserId && assignedUserId !== actorId ? assignedUserId : null;
			if (!statusChanged && !assignedUserId) {
				return;
			}
			const subscribers = await subscriptionDao.listByIssue(
				issue.orgId,
				issue.id,
			);
			const muted = new Set(
				subscribers.filter((sub) => sub.muted).map((sub) => sub.userId),
			);
			const recipients = new Map<string, RecipientPriority>();
			if (notifyUserId && !muted.has(notifyUserId)) {
				setRecipient(recipients, notifyUserId, "issue_assigned");
			}
			if (statusChanged) {
				for (const sub of subscribers) {
					if (sub.userId === actorId || sub.muted) {
						continue;
					}
					if (sub.userId === notifyUserId) {
						continue;
					}
					setRecipient(recipients, sub.userId, "issue_status_changed");
				}
			}
			const subscriptions = assignedUserId
				? [
						{
							orgId: issue.orgId,
							issueId: issue.id,
							userId: assignedUserId,
							reason: "assignee" as const,
						},
					]
				: [];
			await notificationDao.createMany(
				[...recipients].map(([userId, { type }]) =>
					buildRow({
						orgId: issue.orgId,
						userId,
						type,
						issueId: issue.id,
						actorId,
					}),
				),
				subscriptions,
			);
		},

		/**
		 * Fans out a new comment: subscribers get `issue_commented`, the parent
		 * comment author `comment_reply`, and members mentioned in the body
		 * `comment_mention` (highest priority, deduplicated per user).
		 */
		onCommentCreated: async ({
			issue,
			commentId,
			actorId,
			parentAuthorId,
			mentionUserIds,
			activityId,
		}: {
			issue: NotificationIssue;
			commentId: string;
			actorId: string;
			parentAuthorId?: string | null;
			mentionUserIds: string[];
			activityId?: string | null;
		}) => {
			const subscribers = await subscriptionDao.listByIssue(
				issue.orgId,
				issue.id,
			);
			const muted = new Set(
				subscribers.filter((sub) => sub.muted).map((sub) => sub.userId),
			);
			const subscribed = new Set(subscribers.map((sub) => sub.userId));
			const recipients = new Map<string, RecipientPriority>();

			for (const sub of subscribers) {
				if (sub.userId === actorId || sub.muted) {
					continue;
				}
				setRecipient(recipients, sub.userId, "issue_commented");
			}
			if (
				parentAuthorId &&
				parentAuthorId !== actorId &&
				!muted.has(parentAuthorId)
			) {
				setRecipient(recipients, parentAuthorId, "comment_reply");
			}
			for (const userId of mentionUserIds) {
				if (userId === actorId || muted.has(userId)) {
					continue;
				}
				setRecipient(recipients, userId, "comment_mention");
			}

			const subscriptions: {
				orgId: string;
				issueId: string;
				userId: string;
				reason: IssueSubscriptionReason;
			}[] = [];
			if (!subscribed.has(actorId)) {
				subscriptions.push({
					orgId: issue.orgId,
					issueId: issue.id,
					userId: actorId,
					reason: "commenter",
				});
			}
			for (const userId of mentionUserIds) {
				if (userId !== actorId && !subscribed.has(userId)) {
					subscriptions.push({
						orgId: issue.orgId,
						issueId: issue.id,
						userId,
						reason: "mention",
					});
				}
			}

			await notificationDao.createMany(
				[...recipients].map(([userId, { type }]) =>
					buildRow({
						orgId: issue.orgId,
						userId,
						type,
						issueId: issue.id,
						commentId,
						activityId,
						actorId,
					}),
				),
				subscriptions,
			);
		},

		/** Notifies the thread author (never the resolver) of a resolve. */
		onCommentResolved: async ({
			issue,
			commentId,
			authorId,
			actorId,
			activityId,
		}: {
			issue: NotificationIssue;
			commentId: string;
			authorId: string;
			actorId: string;
			activityId?: string | null;
		}) => {
			if (authorId === actorId) {
				return;
			}
			const subscription = await subscriptionDao.findByIssueAndUser(
				issue.id,
				authorId,
			);
			if (subscription?.muted) {
				return;
			}
			await notificationDao.createMany([
				buildRow({
					orgId: issue.orgId,
					userId: authorId,
					type: "comment_resolved",
					issueId: issue.id,
					commentId,
					activityId,
					actorId,
				}),
			]);
		},
	};
};

export type NotificationService = ReturnType<typeof createNotificationService>;
