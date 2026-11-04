import type { BackgroundFn } from "./lib/background";
import type { CleanupService } from "./services/cleanup.service";
import type { RecurrenceService } from "./services/recurrence.service";

export const handleScheduled = async (
	cleanup: Pick<CleanupService, "cleanup">,
	recurrences: Pick<RecurrenceService, "processDue">,
	background?: BackgroundFn,
	now: Date = new Date(),
) => {
	try {
		const counts = await cleanup.cleanup();
		console.log(
			`[cron] cleanup expiredInvitations=${counts.expiredInvitations} failedDeliveries=${counts.failedDeliveries} deletedConversations=${counts.deletedConversations} deletedNotifications=${counts.deletedNotifications} expiredPendingUploads=${counts.expiredPendingUploads} supersededMedia=${counts.supersededMedia}`,
		);
	} catch (err) {
		console.error("[cron] cleanup failed:", err);
	}

	// Runs are independent of cleanup: a broken recurrence must not stop the
	// other scheduled work (and vice versa).
	try {
		const counts = await recurrences.processDue(now, background);
		console.log(
			`[cron] recurrences created=${counts.created} skipped=${counts.skipped} failed=${counts.failed}`,
		);
	} catch (err) {
		console.error("[cron] recurrence processing failed:", err);
	}
};
