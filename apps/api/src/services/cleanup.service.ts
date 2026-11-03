import type { AiConversationDao } from "../dao/ai-conversation.dao";
import type { AttachmentDao } from "../dao/attachment.dao";
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
	attachmentDao,
	mediaAssetDao,
	storage,
}: {
	memberDao: MemberDao;
	deliveryDao: WebhookDeliveryDao;
	conversationDao?: Pick<AiConversationDao, "deleteExpired">;
	pendingUploadDao?: Pick<
		PendingUploadDao,
		"findExpired" | "deleteByKeyIfExpired"
	>;
	attachmentDao?: Pick<AttachmentDao, "existsByKey">;
	mediaAssetDao?: Pick<
		MediaAssetDao,
		"findSupersededBefore" | "deleteById" | "existsByKey"
	>;
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
						// Delete the reservation first: if register already consumed
						// it, this is a no-op and the object must survive.
						const deleted = await pendingUploadDao.deleteByKeyIfExpired(
							row.key,
							now,
						);
						if (!deleted) continue;
						const registered =
							(await attachmentDao?.existsByKey(row.key)) ||
							(await mediaAssetDao?.existsByKey(row.key));
						if (storage && !registered) {
							await storage.remove(row.key);
						}
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
