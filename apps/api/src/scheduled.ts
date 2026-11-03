import type { CleanupService } from "./services/cleanup.service";

export const handleScheduled = async (cleanup: CleanupService) => {
	try {
		const counts = await cleanup.cleanup();
		console.log(
			`[cron] cleanup expiredInvitations=${counts.expiredInvitations} failedDeliveries=${counts.failedDeliveries} deletedConversations=${counts.deletedConversations}`,
		);
	} catch (err) {
		console.error("[cron] cleanup failed:", err);
	}
};
