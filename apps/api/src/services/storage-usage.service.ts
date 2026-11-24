import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { PlanLimitsSource } from "../lib/ports/plan";
import type { StorageQuota } from "../lib/ports/quota";
import type {
	AttachmentUsageDao,
	MediaAssetUsageDao,
	OrgStorageUsage,
	PendingUploadUsageDao,
	UploadQuotaTarget,
} from "../lib/ports/storage-usage";

export type { OrgStorageUsage, UploadQuotaTarget };

export const createStorageUsageService = ({
	attachmentDao,
	pendingUploadDao,
	mediaAssetDao,
	plans,
	quota,
}: {
	attachmentDao: AttachmentUsageDao;
	pendingUploadDao: PendingUploadUsageDao;
	mediaAssetDao: MediaAssetUsageDao;
	plans: PlanLimitsSource;
	quota?: StorageQuota;
}) => {
	return {
		getOrgUsage: async (
			orgId: string,
			now = new Date(),
		): Promise<OrgStorageUsage> => {
			const [attachments, pending, media] = await Promise.all([
				attachmentDao.sumSizeByOrg(orgId),
				pendingUploadDao.sumDeclaredSizeByOrg(orgId, now),
				mediaAssetDao.sumActiveSizeByOrg(orgId),
			]);
			return {
				attachments,
				pending,
				media,
				total: attachments + pending + media,
			};
		},

		assertCanUpload: async (
			orgId: string,
			size: number,
			target: UploadQuotaTarget,
			now = new Date(),
			hold?: { idempotencyKey: string; actorId?: string },
		): Promise<void> => {
			const limits = await plans.getLimitsForOrg(orgId);
			if (
				!Number.isSafeInteger(size) ||
				size < 1 ||
				size > limits.attachmentMaxSize
			) {
				throw new ApiError(
					ApiErrorCode.FILE_TOO_LARGE,
					`Attachment size must be between 1 byte and ${limits.attachmentMaxSize} bytes (plan limit)`,
				);
			}
			const [attachments, pending, media] = await Promise.all([
				attachmentDao.sumSizeByOrg(orgId),
				pendingUploadDao.sumDeclaredSizeByOrg(orgId, now),
				mediaAssetDao.sumActiveSizeByOrg(orgId),
			]);
			if (quota) {
				await quota.authorizeStorage({
					orgId,
					currentBytes: attachments + pending + media,
					incomingBytes: size,
					idempotencyKey:
						hold?.idempotencyKey ?? `storage:${crypto.randomUUID()}`,
					actor: { actorType: "user", actorId: hold?.actorId },
				});
			} else if (attachments + pending + media + size > limits.storageBytes) {
				throw new ApiError(
					ApiErrorCode.STORAGE_QUOTA_EXCEEDED,
					"Organization storage quota exceeded",
				);
			}
			if (target.kind === "issue_attachment") {
				const [existing, reserved] = await Promise.all([
					attachmentDao.countByIssue(orgId, target.issueId),
					pendingUploadDao.countByTarget(
						orgId,
						"issue_attachment",
						target.issueId,
						now,
					),
				]);
				if (existing + reserved + 1 > limits.attachmentsPerIssue) {
					throw new ApiError(
						ApiErrorCode.STORAGE_QUOTA_EXCEEDED,
						"Issue attachment limit exceeded",
					);
				}
				return;
			}
			const [existing, reserved] = await Promise.all([
				attachmentDao.countByComment(orgId, target.commentId),
				pendingUploadDao.countByTarget(
					orgId,
					"comment_attachment",
					target.commentId,
					now,
				),
			]);
			if (existing + reserved + 1 > limits.attachmentsPerComment) {
				throw new ApiError(
					ApiErrorCode.STORAGE_QUOTA_EXCEEDED,
					"Comment attachment limit exceeded",
				);
			}
		},

		settleHold: async (
			orgId: string,
			idempotencyKey: string,
		): Promise<void> => {
			await quota?.settle({
				orgId,
				idempotencyKey,
				actualQuantity: 0,
				consumeAll: true,
			});
		},

		releaseHold: async (
			orgId: string,
			idempotencyKey: string,
		): Promise<void> => {
			await quota?.release({ orgId, idempotencyKey });
		},

		refundGauge: async (
			orgId: string,
			previousBytes: number,
			nextBytes: number,
			sourceId: string,
			actorId?: string,
		): Promise<void> => {
			await quota?.reconcileGauge({
				orgId,
				previousBytes,
				nextBytes,
				sourceId,
				actor: { actorType: "user", actorId },
			});
		},
	};
};

export type StorageUsageService = ReturnType<typeof createStorageUsageService>;
