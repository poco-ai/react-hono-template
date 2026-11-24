import type { FeatureModule } from "../../core/compose";
import type { IssuesContribution } from "../issues/module";
import { createIssueSubscriptionDao } from "./dao/issue-subscription.dao";
import { createNotificationDao } from "./dao/notification.dao";
import { createIssueSubscriptionsRoutes } from "./routes/issue-subscriptions";
import { createNotificationsRoutes } from "./routes/notifications";
import { createIssueSubscriptionService } from "./services/issue-subscription.service";
import {
	createNotificationCleanupHandler,
	createNotificationService,
} from "./services/notification.service";

export type NotificationsDaos = {
	issueSubscriptionDao: ReturnType<typeof createIssueSubscriptionDao>;
	notificationDao: ReturnType<typeof createNotificationDao>;
};

/**
 * Notifications: in-app notification feed, issue subscriptions and the
 * mention/comment notification sink consumed by issue and comment writes.
 */
export const notificationsModule = {
	id: "notifications",
	createDaos: ({ db }) => ({
		issueSubscriptionDao: createIssueSubscriptionDao(db),
		notificationDao: createNotificationDao(db),
	}),
	register: (ctx) => {
		const notificationService = createNotificationService({
			notificationDao: ctx.daos.notificationDao,
			subscriptionDao: ctx.daos.issueSubscriptionDao,
		});
		const issueSubscriptionService = createIssueSubscriptionService({
			issueDao: ctx.features.get<IssuesContribution>("issues").daos.issueDao,
			subscriptionDao: ctx.daos.issueSubscriptionDao,
		});
		return {
			services: { notificationService, issueSubscriptionService },
			routes: [
				{
					phase: "org",
					create: () =>
						createIssueSubscriptionsRoutes(issueSubscriptionService),
				},
				{
					phase: "org",
					create: () => createNotificationsRoutes(notificationService),
				},
			],
			cleanupHandlers: [
				createNotificationCleanupHandler(ctx.daos.notificationDao),
			],
		};
	},
} satisfies FeatureModule<NotificationsDaos>;

export type NotificationsContribution = ReturnType<
	typeof notificationsModule.register
> & { daos: NotificationsDaos };
