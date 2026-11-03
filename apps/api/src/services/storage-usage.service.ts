import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { AttachmentDao } from "../dao/attachment.dao";
import type { MediaAssetDao } from "../dao/media-asset.dao";
import type { PendingUploadDao } from "../dao/pending-upload.dao";
import type { PlanService } from "./plan.service";

export type UploadQuotaTarget =
	| { kind: "issue_attachment"; issueId: string }
	| { kind: "comment_attachment"; commentId: string };

export type OrgStorageUsage = {
	attachments: number;
	pending: number;
	media: number;
	total: number;
};

export const createStorageUsageService = ({
	attachmentDao,
	pendingUploadDao,
	mediaAssetDao,
	plans,
}: {
	attachmentDao: Pick<
		AttachmentDao,
		"sumSizeByOrg" | "countByIssue" | "countByComment"
	>;
	pendingUploadDao: Pick<
		PendingUploadDao,
		"sumDeclaredSizeByOrg" | "countByTarget"
	>;
	mediaAssetDao: Pick<MediaAssetDao, "sumActiveSizeByOrg">;
	plans: Pick<PlanService, "getLimitsForOrg">;
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
		): Promise<void> => {
			const limits = await plans.getLimitsForOrg(orgId);
			if (
				!Number.isSafeInteger(size) ||
				size < 1 ||
				size > limits.attachmentMaxSize
			) {
				throw new ApiError(
					413,
					ApiErrorCode.FILE_TOO_LARGE,
					`Attachment size must be between 1 byte and ${limits.attachmentMaxSize} bytes (plan limit)`,
				);
			}
			const [attachments, pending, media] = await Promise.all([
				attachmentDao.sumSizeByOrg(orgId),
				pendingUploadDao.sumDeclaredSizeByOrg(orgId, now),
				mediaAssetDao.sumActiveSizeByOrg(orgId),
			]);
			if (attachments + pending + media + size > limits.storageBytes) {
				throw new ApiError(
					403,
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
						403,
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
					403,
					ApiErrorCode.STORAGE_QUOTA_EXCEEDED,
					"Comment attachment limit exceeded",
				);
			}
		},
	};
};

export type StorageUsageService = ReturnType<typeof createStorageUsageService>;
