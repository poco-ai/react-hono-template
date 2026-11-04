import {
	ApiError,
	ApiErrorCode,
	COMMENT_REACTION_EMOJIS,
	type CommentListQuery,
	type CommentReactionInput,
	type CreateCommentInput,
	parseMentionUserIds,
	type UpdateCommentInput,
} from "@workspace/shared";
import type { ActivityInsert } from "../dao/activity.dao";
import type { CommentDao } from "../dao/comment.dao";
import type { CommentMentionDao } from "../dao/comment-mention.dao";
import type { CommentReactionDao } from "../dao/comment-reaction.dao";
import type { IssueDao } from "../dao/issue.dao";
import type { MemberDao } from "../dao/member.dao";
import type { ProjectDao } from "../dao/project.dao";
import type { AttachmentWithUrlDto } from "../dto/attachment.dto";
import type {
	CommentDto,
	CommentReactionSummaryDto,
	CommentReactionsDto,
	ListCommentsDto,
} from "../dto/comment.dto";
import type { IssueDto } from "../dto/issue.dto";
import type { BackgroundFn } from "../lib/background";
import {
	bestEffortNotification,
	type NotificationService,
} from "./notification.service";
import type { WebhookDispatcher } from "./webhook-delivery.service";

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

const activityExcerpt = (body: string) => {
	const compact = body.replace(/\s+/g, " ").trim();
	return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
};

/** Reaction aggregates in the shared whitelist order, then any legacy emoji. */
const summarizeReactions = (
	rows: { userId: string; emoji: string }[],
	userId: string | null,
): CommentReactionSummaryDto[] => {
	const counts = new Map<string, { count: number; mine: boolean }>();
	for (const row of rows) {
		const entry = counts.get(row.emoji) ?? { count: 0, mine: false };
		entry.count += 1;
		if (userId && row.userId === userId) {
			entry.mine = true;
		}
		counts.set(row.emoji, entry);
	}
	const order = new Map<string, number>(
		COMMENT_REACTION_EMOJIS.map((emoji, index) => [emoji, index]),
	);
	return [...counts.entries()]
		.sort(
			([a], [b]) =>
				(order.get(a) ?? Number.MAX_SAFE_INTEGER) -
				(order.get(b) ?? Number.MAX_SAFE_INTEGER),
		)
		.map(([emoji, { count, mine }]) => ({ emoji, count, mine }));
};

export const createCommentService = ({
	commentDao,
	issueDao,
	projectDao,
	webhooks,
	files,
	notifications,
	memberDao,
	reactionDao,
	mentionDao,
}: {
	commentDao: CommentDao;
	issueDao: IssueDao;
	projectDao: ProjectDao;
	webhooks?: WebhookDispatcher;
	files?: {
		forComments: (
			orgId: string,
			commentIds: string[],
		) => Promise<Map<string, AttachmentWithUrlDto[]>>;
		purgeForComment: (orgId: string, commentId: string) => Promise<void>;
	};
	notifications?: Pick<
		NotificationService,
		"onCommentCreated" | "onCommentResolved"
	>;
	memberDao?: Pick<MemberDao, "filterMemberIds">;
	reactionDao?: CommentReactionDao;
	mentionDao?: CommentMentionDao;
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

	/** Adds reaction/mention aggregates for a page of comments. */
	const decorate = async (
		items: CommentDto[],
		userId: string | null,
	): Promise<CommentDto[]> => {
		if (items.length === 0) {
			return items;
		}
		const ids = items.map((item) => item.id);
		const [reactionRows, mentionRows] = await Promise.all([
			reactionDao?.listByComments(ids) ?? [],
			mentionDao?.listByComments(ids) ?? [],
		]);
		const reactionsByComment = new Map<
			string,
			{ userId: string; emoji: string }[]
		>();
		for (const row of reactionRows) {
			const entry = reactionsByComment.get(row.commentId) ?? [];
			entry.push({ userId: row.userId, emoji: row.emoji });
			reactionsByComment.set(row.commentId, entry);
		}
		const mentionsByComment = new Map<string, CommentDto["mentions"]>();
		for (const row of mentionRows) {
			const entry = mentionsByComment.get(row.commentId) ?? [];
			entry.push(row.user);
			mentionsByComment.set(row.commentId, entry);
		}
		return items.map((item) => ({
			...item,
			reactions: summarizeReactions(
				reactionsByComment.get(item.id) ?? [],
				userId,
			),
			mentions: mentionsByComment.get(item.id) ?? [],
		}));
	};

	const requireReactionDao = (dao: CommentReactionDao | undefined) => {
		if (!dao) {
			throw new ApiError(
				500,
				ApiErrorCode.INTERNAL_ERROR,
				"Reactions are not configured",
			);
		}
		return dao;
	};

	return {
		listComments: async (
			orgId: string,
			projectId: string,
			number: number,
			query: CommentListQuery,
			userId: string | null = null,
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
			const page = await commentDao.listByIssue(
				orgId,
				issue.id,
				query.page,
				query.pageSize,
			);
			const items = await decorate(page.items, userId);
			if (!files || items.length === 0) {
				return { ...page, items };
			}
			const grouped = await files.forComments(
				orgId,
				items.map((item) => item.id),
			);
			return {
				...page,
				items: items.map((item) => ({
					...item,
					attachments: grouped.get(item.id) ?? [],
				})),
			};
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
			const parentId = input.parentId ?? null;
			const parent = parentId
				? await commentDao.findById(orgId, parentId)
				: null;
			if (parentId && (!parent || parent.issueId !== issue.id)) {
				throw new ApiError(
					400,
					ApiErrorCode.COMMENT_PARENT_INVALID,
					"Reply target must be a comment on this issue",
				);
			}
			if (parent?.parentId) {
				throw new ApiError(
					400,
					ApiErrorCode.COMMENT_THREAD_DEPTH,
					"Replies can only target a top-level comment",
				);
			}
			// Mentions are resolved against org membership at write time; ids
			// that are not members (or malformed markup) are ignored, not 400s.
			const candidates = parseMentionUserIds(input.body);
			const mentionUserIds =
				candidates.length > 0 && memberDao
					? await memberDao.filterMemberIds(orgId, candidates)
					: [];
			const id = crypto.randomUUID();
			const activity = recordActivity(
				orgId,
				issue.projectId,
				issue.id,
				userId,
				"comment.created",
			);
			const comment = await commentDao.create(
				{
					id,
					orgId,
					issueId: issue.id,
					authorId: userId,
					body: input.body,
					parentId,
				},
				activity,
				mentionUserIds.map((mentionUserId) => ({
					commentId: id,
					userId: mentionUserId,
				})),
			);
			const [decorated] = await decorate([comment], userId);

			await bestEffortNotification("comment.created", () =>
				notifications?.onCommentCreated({
					issue,
					commentId: comment.id,
					actorId: userId,
					parentAuthorId: parent?.author.id ?? null,
					mentionUserIds,
					activityId: activity.id,
				}),
			);
			await webhooks?.dispatch(
				orgId,
				"comment.created",
				{
					comment: decorated ?? comment,
					issueId: issue.id,
					issueNumber: issue.number,
				},
				background,
			);
			return decorated ?? comment;
		},

		updateComment: async (
			orgId: string,
			projectId: string,
			number: number,
			commentId: string,
			userId: string,
			input: UpdateCommentInput,
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
			// Mentions follow the edited body (same membership filter and dedupe
			// as creation), but an edit never re-notifies: otherwise an author
			// could page the whole organization by editing in new mentions.
			const candidates = parseMentionUserIds(input.body);
			const mentionUserIds =
				candidates.length > 0 && memberDao
					? await memberDao.filterMemberIds(orgId, candidates)
					: [];
			const updated = await commentDao.update(
				orgId,
				commentId,
				input.body,
				mentionUserIds.map((mentionUserId) => ({
					commentId,
					userId: mentionUserId,
				})),
			);
			if (!updated) {
				throw new ApiError(
					404,
					ApiErrorCode.COMMENT_NOT_FOUND,
					`Comment ${commentId} not found`,
				);
			}
			const [decorated] = await decorate([updated], userId);
			return decorated ?? updated;
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
			await files?.purgeForComment(orgId, comment.id);
			await commentDao.delete(orgId, commentId);
		},

		/**
		 * Resolves or reopens a thread. Any organization member may do this
		 * (mirrors Linear's lightweight resolve); only top-level comments carry
		 * resolution state, and the thread author is notified unless they
		 * resolved it themselves.
		 */
		resolveComment: async (
			orgId: string,
			projectId: string,
			number: number,
			commentId: string,
			userId: string,
			resolved: boolean,
		): Promise<CommentDto> => {
			const issue = await assertIssueCommentable(
				issueDao,
				projectDao,
				orgId,
				projectId,
				number,
			);
			const comment = await requireComment(orgId, issue.id, commentId);
			if (comment.parentId) {
				throw new ApiError(
					400,
					ApiErrorCode.COMMENT_THREAD_DEPTH,
					"Only top-level comment threads can be resolved",
				);
			}
			const alreadyResolved = comment.resolvedAt !== null;
			if (alreadyResolved === resolved) {
				const [decorated] = await decorate([comment], userId);
				return decorated ?? comment;
			}
			const activity = resolved
				? {
						...recordActivity(
							orgId,
							issue.projectId,
							issue.id,
							userId,
							"issue.updated",
						),
						// Kept as an `issue.updated` activity so existing activity
						// consumers keep working.
						field: "comment_resolved",
						newValue: activityExcerpt(comment.body),
					}
				: undefined;
			await commentDao.setResolution(
				orgId,
				comment.id,
				resolved ? new Date() : null,
				resolved ? userId : null,
				activity,
			);
			const updated = await commentDao.findById(orgId, comment.id);
			if (!updated) {
				throw new ApiError(
					404,
					ApiErrorCode.COMMENT_NOT_FOUND,
					`Comment ${commentId} not found`,
				);
			}
			if (resolved) {
				await bestEffortNotification("comment.resolved", () =>
					notifications?.onCommentResolved({
						issue,
						commentId: comment.id,
						authorId: comment.author.id,
						actorId: userId,
						activityId: activity?.id,
					}),
				);
			}
			const [decorated] = await decorate([updated], userId);
			return decorated ?? updated;
		},

		/** Toggles one emoji for the current user; returns the full summary. */
		toggleReaction: async (
			orgId: string,
			projectId: string,
			number: number,
			commentId: string,
			userId: string,
			input: CommentReactionInput,
		): Promise<CommentReactionsDto> => {
			const issue = await assertIssueCommentable(
				issueDao,
				projectDao,
				orgId,
				projectId,
				number,
			);
			const comment = await requireComment(orgId, issue.id, commentId);
			const dao = requireReactionDao(reactionDao);
			await dao.toggle(comment.id, userId, input.emoji);
			const rows = await dao.listByComments([comment.id]);
			return {
				commentId: comment.id,
				reactions: summarizeReactions(
					rows.map((row) => ({ userId: row.userId, emoji: row.emoji })),
					userId,
				),
			};
		},
	};
};

export type CommentService = ReturnType<typeof createCommentService>;
