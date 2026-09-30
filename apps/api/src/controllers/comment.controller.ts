import type { CommentListQuery, CreateCommentInput } from "@workspace/shared";
import type { Context } from "hono";
import { backgroundFromContext } from "../lib/background";
import {
	requireIssueNumber,
	requireParam,
	requireProjectId,
} from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { CommentService } from "../services/comment.service";

type Env = SessionEnv & OrgEnv;

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
				requireParam(c, "commentId"),
				c.get("session").user.id,
				input,
			),
		),

	remove: async (c: Context<Env>) => {
		await service.deleteComment(
			c.get("orgMember").orgId,
			requireProjectId(c),
			requireIssueNumber(c),
			requireParam(c, "commentId"),
			c.get("session").user.id,
		);
		return ok(c, { deleted: true });
	},
});
