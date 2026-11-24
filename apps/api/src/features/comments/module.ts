import type { FeatureModule } from "../../core/compose";
import type { AttachmentsContribution } from "../attachments/module";
import type { IssuesContribution } from "../issues/module";
import type { NotificationsContribution } from "../notifications/module";
import type { ProjectsContribution } from "../projects/module";
import type { WebhooksContribution } from "../webhooks/module";
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
 * decoration degrades to plain text when the attachments feature is
 * trimmed (Phase 1 port).
 */
export const commentsModule = {
	id: "comments",
	createDaos: ({ db }) => ({
		commentDao: createCommentDao(db),
		commentReactionDao: createCommentReactionDao(db),
		commentMentionDao: createCommentMentionDao(db),
	}),
	register: (ctx) => {
		const commentService = createCommentService({
			commentDao: ctx.daos.commentDao,
			issueDao: ctx.features.get<IssuesContribution>("issues").daos.issueDao,
			projectDao:
				ctx.features.get<ProjectsContribution>("projects").daos.projectDao,
			webhooks:
				ctx.features.get<WebhooksContribution>("webhooks").services
					.webhookDeliveryService,
			files:
				ctx.features.get<AttachmentsContribution>("attachments").services
					.attachmentService,
			notifications:
				ctx.features.get<NotificationsContribution>("notifications").services
					.notificationService,
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
