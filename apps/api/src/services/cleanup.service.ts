import type { AiConversationDao } from "../dao/ai-conversation.dao";
import type { MediaAssetDao } from "../dao/media-asset.dao";
import type { MemberDao } from "../dao/member.dao";
import type { PendingUploadDao } from "../dao/pending-upload.dao";
import type { WebhookDeliveryDao } from "../dao/webhook-delivery.dao";
import type { StorageAdapter } from "../lib/storage/types";
import {
	PENDING_CLEANUP_LIMIT,
	SUPERSEDED_MEDIA_TTL_MS,
} from "../lib/storage/uploads";

export const ABANDONED_DELIVERY_AGE_MS = 15 * 60 * 1000;
export const ABANDONED_DELIVERY_ERROR = "delivery timed out";

export const createCleanupService = ({
	memberDao,
	deliveryDao,
	conversationDao,
	pendingUploadDao,
	mediaAssetDao,
	storage,
}: {
	memberDao: MemberDao;
	deliveryDao: WebhookDeliveryDao;
	conversationDao?: Pick<AiConversationDao, "deleteExpired">;
	pendingUploadDao?: Pick<PendingUploadDao, "findExpired" | "deleteByKey">;
	mediaAssetDao?: Pick<MediaAssetDao, "findSupersededBefore" | "deleteById">;
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
			let supersededMedia = 0;
			if (mediaAssetDao) {
				const cutoff = new Date(now.getTime() - SUPERSEDED_MEDIA_TTL_MS);
				const stale = await mediaAssetDao.findSupersededBefore(
					cutoff,
					PENDING_CLEANUP_LIMIT,
				);
				for (const asset of stale) {
					try {
						if (storage) {
							await storage.remove(asset.key);
						}
						await mediaAssetDao.deleteById(asset.id);
						supersededMedia += 1;
					} catch (error) {
						console.error(
							"[cleanup] superseded media delete failed:",
							asset.key,
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
				supersededMedia,
			};
		},
	};
};

export type CleanupService = ReturnType<typeof createCleanupService>;
