import type { MemberDao } from "../dao/member.dao";
import type { WebhookDeliveryDao } from "../dao/webhook-delivery.dao";

export const ABANDONED_DELIVERY_AGE_MS = 15 * 60 * 1000;
export const ABANDONED_DELIVERY_ERROR = "delivery timed out";

export const createCleanupService = ({
	memberDao,
	deliveryDao,
}: {
	memberDao: MemberDao;
	deliveryDao: WebhookDeliveryDao;
}) => {
	return {
		cleanup: async (now = new Date()) => {
			const olderThan = new Date(now.getTime() - ABANDONED_DELIVERY_AGE_MS);
			const expiredInvitations = await memberDao.deleteExpiredPending(now);
			const failedDeliveries = await deliveryDao.failNeverAttempted(
				olderThan,
				now,
				ABANDONED_DELIVERY_ERROR,
			);
			return { expiredInvitations, failedDeliveries };
		},
	};
};

export type CleanupService = ReturnType<typeof createCleanupService>;
