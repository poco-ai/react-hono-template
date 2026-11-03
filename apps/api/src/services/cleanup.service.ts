import type { AiConversationDao } from "../dao/ai-conversation.dao";
import type { MemberDao } from "../dao/member.dao";
import type { PendingUploadDao } from "../dao/pending-upload.dao";
import type { WebhookDeliveryDao } from "../dao/webhook-delivery.dao";
import type { StorageAdapter } from "../lib/storage/types";
import { PENDING_CLEANUP_LIMIT } from "../lib/storage/uploads";

export const ABANDONED_DELIVERY_AGE_MS = 15 * 60 * 1000;
export const ABANDONED_DELIVERY_ERROR = "delivery timed out";

export const createCleanupService = ({
	memberDao,
	deliveryDao,
	conversationDao,
	pendingUploadDao,
	storage,
}: {
	memberDao: MemberDao;
	deliveryDao: WebhookDeliveryDao;
	conversationDao?: Pick<AiConversationDao, "deleteExpired">;
	pendingUploadDao?: Pick<PendingUploadDao, "findExpired" | "deleteByKey">;
	storage?: StorageAdapter | null;
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
			const deletedConversations = conversationDao
				? await conversationDao.deleteExpired(now)
				: 0;
			let expiredPendingUploads = 0;
			if (pendingUploadDao) {
				const expired = await pendingUploadDao.findExpired(
					now,
					PENDING_CLEANUP_LIMIT,
				);
				for (const row of expired) {
					try {
						if (storage) {
							await storage.remove(row.key);
						}
						await pendingUploadDao.deleteByKey(row.key);
						expiredPendingUploads += 1;
					} catch (error) {
						console.error(
							"[cleanup] pending upload delete failed:",
							row.key,
							error,
						);
					}
				}
			}
			return {
				expiredInvitations,
				failedDeliveries,
				deletedConversations,
				expiredPendingUploads,
			};
		},
	};
};

export type CleanupService = ReturnType<typeof createCleanupService>;
