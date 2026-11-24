import type { ScheduledJob } from "../compose";
import type { CleanupService } from "../services/cleanup.service";

/**
 * Core cleanup cron: expired invitations plus every handler the features
 * contributed. The log line keeps the historical key layout so existing
 * alerting rules survive the composition refactor.
 */
export const createCleanupScheduledJob = (
	cleanup: Pick<CleanupService, "cleanup">,
): ScheduledJob => ({
	name: "cleanup",
	run: async () => {
		const counts = await cleanup.cleanup();
		console.log(
			`[cron] cleanup expiredInvitations=${counts.expiredInvitations} failedDeliveries=${counts.failedDeliveries} deletedConversations=${counts.deletedConversations} deletedNotifications=${counts.deletedNotifications} expiredPendingUploads=${counts.expiredPendingUploads} supersededMedia=${counts.supersededMedia}`,
		);
	},
	failureMessage: "[cron] cleanup failed:",
});
