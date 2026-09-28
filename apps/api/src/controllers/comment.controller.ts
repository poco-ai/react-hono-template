import {
	ApiError,
	ApiErrorCode,
	type CommentListQuery,
	type CreateCommentInput,
} from "@workspace/shared";
import type { Context } from "hono";
import { backgroundFromContext } from "../lib/background";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { CommentService } from "../services/comment.service";

type Env = SessionEnv & OrgEnv;

const requireProjectId = (c: Context<Env>) => {
	const projectId = c.req.param("projectId");
	if (!projectId) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			"Missing required param: projectId",
		);
	}
	return projectId;
};

const requireIssueNumber = (c: Context<Env>) => {
	const raw = c.req.param("number");
	const number = Number(raw);
	if (!/^\d+$/.test(raw ?? "") || !Number.isInteger(number) || number < 1) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			"Issue number must be a positive integer",
		);
	}
	return number;
};

const requireCommentId = (c: Context<Env>) => {
	const commentId = c.req.param("commentId");
	if (!commentId) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			"Missing required param: commentId",
		);
	}
	return commentId;
};

export const createCommentController = (service: CommentService) => ({
	list: async (c: Context<Env>, query: CommentListQuery) =>
		ok(
			c,
			await service.listComments(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireIssueNumber(c),
				query,
			),
		),

	create: async (c: Context<Env>, input: CreateCommentInput) =>
		ok(
			c,
			await service.createComment(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireIssueNumber(c),
				c.get("session").user.id,
				input,
				backgroundFromContext(c),
			),
		),

	update: async (c: Context<Env>, input: CreateCommentInput) =>
		ok(
			c,
			await service.updateComment(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireIssueNumber(c),
				requireCommentId(c),
				c.get("session").user.id,
				input,
			),
		),

	remove: async (c: Context<Env>) => {
		await service.deleteComment(
			c.get("orgMember").orgId,
			requireProjectId(c),
			requireIssueNumber(c),
			requireCommentId(c),
			c.get("session").user.id,
		);
		return ok(c, { deleted: true });
	},
});

export type CommentController = ReturnType<typeof createCommentController>;
