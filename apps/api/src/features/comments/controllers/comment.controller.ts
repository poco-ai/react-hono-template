import type {
	CommentListQuery,
	CommentReactionInput,
	CreateCommentInput,
	ResolveCommentInput,
	UpdateCommentInput,
} from "@workspace/shared";
import { backgroundFromContext } from "../../../core/lib/background";
import type {
	CommentParams,
	IssueParams,
	ParamContext,
} from "../../../core/lib/params";
import { ok } from "../../../core/lib/response";
import type { CommentService } from "../services/comment.service";

export const createCommentController = (service: CommentService) => ({
	list: async (c: ParamContext<IssueParams>, query: CommentListQuery) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.listComments(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				query,
				c.get("session").user.id,
			),
		);
	},

	create: async (c: ParamContext<IssueParams>, input: CreateCommentInput) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.createComment(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				c.get("session").user.id,
				input,
				backgroundFromContext(c),
			),
		);
	},

	update: async (c: ParamContext<CommentParams>, input: UpdateCommentInput) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.updateComment(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				params.commentId,
				c.get("session").user.id,
				input,
			),
		);
	},

	remove: async (c: ParamContext<CommentParams>) => {
		const params = c.req.valid("param");
		await service.deleteComment(
			c.get("orgMember").orgId,
			params.projectId,
			params.number,
			params.commentId,
			c.get("session").user.id,
		);
		return ok(c, { deleted: true });
	},

	resolve: async (
		c: ParamContext<CommentParams>,
		input: ResolveCommentInput,
	) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.resolveComment(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				params.commentId,
				c.get("session").user.id,
				input.resolved,
			),
		);
	},

	react: async (
		c: ParamContext<CommentParams>,
		input: CommentReactionInput,
	) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.toggleReaction(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				params.commentId,
				c.get("session").user.id,
				input,
			),
		);
	},
});
