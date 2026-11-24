import type { FeatureModule } from "../../core/compose";
import type { FullFeatureContext } from "../../feature-context";
import type { BillingContribution } from "../billing/module";
import type { CommentsContribution } from "../comments/module";
import type { IssuesContribution } from "../issues/module";
import type { ProjectsContribution } from "../projects/module";
import type { WebhooksContribution } from "../webhooks/module";
import { createAttachmentDao } from "./dao/attachment.dao";
import { createMediaAssetDao } from "./dao/media-asset.dao";
import { createPendingUploadDao } from "./dao/pending-upload.dao";
import { s3ClientFromConfig } from "./lib/s3-client";
import { createAttachmentsRoutes } from "./routes/attachments";
import {
	createMediaRoutes,
	createMeMediaRoutes,
	createOrgLogoRoutes,
} from "./routes/media";
import {
	createAttachmentService,
	createStorageCleanupHandler,
} from "./services/attachment.service";
import { createMediaService } from "./services/media.service";

export type AttachmentsDaos = {
	attachmentDao: ReturnType<typeof createAttachmentDao>;
	pendingUploadDao: ReturnType<typeof createPendingUploadDao>;
	mediaAssetDao: ReturnType<typeof createMediaAssetDao>;
};

/**
 * Attachments and media: S3-backed uploads, avatars/org logos and public
 * media serving. The media router spans three mount phases (public asset
 * reads, authenticated me avatar presign, org-scoped logo presign).
 */
export const attachmentsModule = {
	id: "attachments",
	platform: (env) => ({ storage: s3ClientFromConfig(env) }),
	createDaos: ({ db }) => ({
		attachmentDao: createAttachmentDao(db),
		pendingUploadDao: createPendingUploadDao(db),
		mediaAssetDao: createMediaAssetDao(db),
	}),
	register: (ctx) => {
		const mediaService = createMediaService({
			mediaAssetDao: ctx.daos.mediaAssetDao,
			pendingUploadDao: ctx.daos.pendingUploadDao,
			storage: ctx.storage,
			resolvePublicApiUrl: ctx.resolvePublicApiUrl,
		});
		const attachmentService = createAttachmentService({
			attachmentDao: ctx.daos.attachmentDao,
			issueDao: ctx.features.get<IssuesContribution>("issues").daos.issueDao,
			projectDao:
				ctx.features.get<ProjectsContribution>("projects").daos.projectDao,
			commentDao:
				ctx.features.get<CommentsContribution>("comments").daos.commentDao,
			pendingUploadDao: ctx.daos.pendingUploadDao,
			storage: ctx.storage,
			webhooks:
				ctx.features.get<WebhooksContribution>("webhooks").services
					.webhookDeliveryService,
			plans: ctx.core.planService,
			storageUsage:
				ctx.features.get<BillingContribution>("billing").extras.storageUsage,
		});
		return {
			services: { attachmentService, mediaService },
			routes: [
				{
					phase: "public",
					create: () => createMediaRoutes(mediaService),
				},
				{
					phase: "me",
					create: () => createMeMediaRoutes(mediaService),
				},
				{
					phase: "org",
					create: () => createAttachmentsRoutes(attachmentService),
				},
				{
					phase: "org",
					create: () => createOrgLogoRoutes(mediaService),
				},
			],
			cleanupHandlers: [
				createStorageCleanupHandler({
					pendingUploadDao: ctx.daos.pendingUploadDao,
					attachmentDao: ctx.daos.attachmentDao,
					mediaAssetDao: ctx.daos.mediaAssetDao,
					storage: ctx.storage,
					quota:
						ctx.features.get<BillingContribution>("billing").services
							.quotaService,
				}),
			],
		};
	},
} satisfies FeatureModule<AttachmentsDaos, FullFeatureContext>;

export type AttachmentsContribution = ReturnType<
	typeof attachmentsModule.register
> & { daos: AttachmentsDaos };
