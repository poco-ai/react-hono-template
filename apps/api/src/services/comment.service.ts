import {
	ApiError,
	ApiErrorCode,
	type CommentListQuery,
	type CreateCommentInput,
} from "@workspace/shared";
import type { ActivityInsert } from "../dao/activity.dao";
import type { CommentDao } from "../dao/comment.dao";
import type { IssueDao } from "../dao/issue.dao";
import type { ProjectDao } from "../dao/project.dao";
import type { CommentDto, ListCommentsDto } from "../dto/comment.dto";
import type { IssueDto } from "../dto/issue.dto";
import type { BackgroundFn } from "../lib/background";
import type { WebhookDispatcher } from "./webhook.service";

const assertIssueCommentable = async (
	issueDao: IssueDao,
	projectDao: ProjectDao,
	orgId: string,
	projectId: string,
	number: number,
): Promise<IssueDto> => {
	const issue = await issueDao.findByProjectAndNumber(orgId, projectId, number);
	if (!issue) {
		throw new ApiError(
			404,
			ApiErrorCode.ISSUE_NOT_FOUND,
			`Issue #${number} not found`,
		);
	}
	const project = await projectDao.findById(orgId, issue.projectId);
	if (project?.archived) {
		throw new ApiError(
			409,
			ApiErrorCode.PROJECT_ARCHIVED,
			"Project is archived and read-only",
		);
	}
	return issue;
};

export const createCommentService = ({
	commentDao,
	issueDao,
	projectDao,
	webhooks,
}: {
	commentDao: CommentDao;
	issueDao: IssueDao;
	projectDao: ProjectDao;
	webhooks?: WebhookDispatcher;
}) => {
	const recordActivity = (
		orgId: string,
		projectId: string,
		issueId: string,
		actorId: string,
		action: string,
	): ActivityInsert => ({
		id: crypto.randomUUID(),
		orgId,
		projectId,
		issueId,
		actorId,
		action,
		field: null,
		oldValue: null,
		newValue: null,
	});

	const requireComment = async (
		orgId: string,
		issueId: string,
		commentId: string,
	): Promise<CommentDto> => {
		const comment = await commentDao.findById(orgId, commentId);
		if (!comment || comment.issueId !== issueId) {
			throw new ApiError(
				404,
				ApiErrorCode.COMMENT_NOT_FOUND,
				`Comment ${commentId} not found`,
			);
		}
		return comment;
	};

	return {
		listComments: async (
			orgId: string,
			projectId: string,
			number: number,
			query: CommentListQuery,
		): Promise<ListCommentsDto> => {
			const issue = await issueDao.findByProjectAndNumber(
				orgId,
				projectId,
				number,
			);
			if (!issue) {
				throw new ApiError(
					404,
					ApiErrorCode.ISSUE_NOT_FOUND,
					`Issue #${number} not found`,
				);
			}
			return commentDao.listByIssue(
				orgId,
				issue.id,
				query.page,
				query.pageSize,
			);
		},

		createComment: async (
			orgId: string,
			projectId: string,
			number: number,
			userId: string,
			input: CreateCommentInput,
			background?: BackgroundFn,
		): Promise<CommentDto> => {
			const issue = await assertIssueCommentable(
				issueDao,
				projectDao,
				orgId,
				projectId,
				number,
			);
			const comment = await commentDao.create(
				{
					id: crypto.randomUUID(),
					orgId,
					issueId: issue.id,
					authorId: userId,
					body: input.body,
				},
				recordActivity(
					orgId,
					issue.projectId,
					issue.id,
					userId,
					"comment.created",
				),
			);
			await webhooks?.dispatch(
				orgId,
				"comment.created",
				{ comment, issueId: issue.id, issueNumber: issue.number },
				background,
			);
			return comment;
		},

		updateComment: async (
			orgId: string,
			projectId: string,
			number: number,
			commentId: string,
			userId: string,
			input: CreateCommentInput,
		): Promise<CommentDto> => {
			const issue = await assertIssueCommentable(
				issueDao,
				projectDao,
				orgId,
				projectId,
				number,
			);
			const comment = await requireComment(orgId, issue.id, commentId);
			if (comment.author.id !== userId) {
				throw new ApiError(
					403,
					ApiErrorCode.FORBIDDEN,
					"Only the author can edit this comment",
				);
			}
			const updated = await commentDao.update(orgId, commentId, input.body);
			if (!updated) {
				throw new ApiError(
					404,
					ApiErrorCode.COMMENT_NOT_FOUND,
					`Comment ${commentId} not found`,
				);
			}
			return updated;
		},

		deleteComment: async (
			orgId: string,
			projectId: string,
			number: number,
			commentId: string,
			userId: string,
		) => {
			const issue = await assertIssueCommentable(
				issueDao,
				projectDao,
				orgId,
				projectId,
				number,
			);
			const comment = await requireComment(orgId, issue.id, commentId);
			if (comment.author.id !== userId) {
				throw new ApiError(
					403,
					ApiErrorCode.FORBIDDEN,
					"Only the author can delete this comment",
				);
			}
			await commentDao.delete(orgId, commentId);
		},
	};
};

export type CommentService = ReturnType<typeof createCommentService>;
