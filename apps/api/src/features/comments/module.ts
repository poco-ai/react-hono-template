import type { FeatureModule } from "../../core/compose";
import type { AttachmentFileLookup } from "../../core/lib/ports/attachments";
import type { CommentNotifications } from "../../core/lib/ports/notifications";
import type { WebhookDispatcher } from "../../core/lib/ports/webhook-dispatcher";
import type { IssuesContribution } from "../issues/module";
import type { ProjectsContribution } from "../projects/module";
import { createCommentDao } from "./dao/comment.dao";
import { createCommentMentionDao } from "./dao/comment-mention.dao";
import { createCommentReactionDao } from "./dao/comment-reaction.dao";
import { createCommentsRoutes } from "./routes/comments";
import { createCommentService } from "./services/comment.service";

export type CommentsDaos = {
	commentDao: ReturnType<typeof createCommentDao>;
	commentReactionDao: ReturnType<typeof createCommentReactionDao>;
	commentMentionDao: ReturnType<typeof createCommentMentionDao>;
};

/**
 * Comments: threaded discussion with reactions and mentions. Attachment
 * decoration, webhook fan-out and notifications are optional ports; the
 * feature degrades gracefully when a soft dependency is trimmed.
 */
export const commentsModule = {
	id: "comments",
	createDaos: ({ db }) => ({
		commentDao: createCommentDao(db),
		commentReactionDao: createCommentReactionDao(db),
		commentMentionDao: createCommentMentionDao(db),
	}),
	register: (ctx) => {
		const webhooks = ctx.features.find<{
			services: { webhookDeliveryService: WebhookDispatcher };
		}>("webhooks");
		const attachments = ctx.features.find<{
			services: { attachmentService: AttachmentFileLookup };
		}>("attachments");
		const notifications = ctx.features.find<{
			services: { notificationService: CommentNotifications };
		}>("notifications");
		const commentService = createCommentService({
			commentDao: ctx.daos.commentDao,
			issueDao: ctx.features.get<IssuesContribution>("issues").daos.issueDao,
			projectDao:
				ctx.features.get<ProjectsContribution>("projects").daos.projectDao,
			webhooks: webhooks?.services.webhookDeliveryService,
			files: attachments?.services.attachmentService,
			notifications: notifications?.services.notificationService,
			memberDao: ctx.daos.memberDao,
			reactionDao: ctx.daos.commentReactionDao,
			mentionDao: ctx.daos.commentMentionDao,
		});
		return {
			services: { commentService },
			routes: [
				{
					phase: "org",
					create: () => createCommentsRoutes(commentService),
				},
			],
		};
	},
} satisfies FeatureModule<CommentsDaos>;

export type CommentsContribution = ReturnType<
	typeof commentsModule.register
> & {
	daos: CommentsDaos;
};
