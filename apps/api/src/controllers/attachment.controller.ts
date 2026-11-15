import type {
	AttachmentPresignInput,
	RegisterAttachmentInput,
} from "@workspace/shared";
import { backgroundFromContext } from "../lib/background";
import type {
	AttachmentParams,
	CommentAttachmentParams,
	CommentParams,
	IssueParams,
	ParamContext,
} from "../lib/params";
import { ok } from "../lib/response";
import type { AttachmentService } from "../services/attachment.service";

export const createAttachmentController = (service: AttachmentService) => ({
	list: async (c: ParamContext<IssueParams>) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.list(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
			),
		);
	},

	presign: async (
		c: ParamContext<IssueParams>,
		input: AttachmentPresignInput,
	) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.presignUpload(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				c.get("session").user.id,
				input,
			),
		);
	},

	register: async (
		c: ParamContext<IssueParams>,
		input: RegisterAttachmentInput,
	) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.register(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				c.get("session").user.id,
				input,
				backgroundFromContext(c),
			),
		);
	},

	remove: async (c: ParamContext<AttachmentParams>) => {
		const orgMember = c.get("orgMember");
		const params = c.req.valid("param");
		return ok(
			c,
			await service.remove(
				orgMember.orgId,
				params.projectId,
				params.number,
				params.attachmentId,
				{ userId: orgMember.userId, role: orgMember.role },
			),
		);
	},

	presignComment: async (
		c: ParamContext<CommentParams>,
		input: AttachmentPresignInput,
	) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.presignCommentUpload(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				params.commentId,
				c.get("session").user.id,
				input,
			),
		);
	},

	registerComment: async (
		c: ParamContext<CommentParams>,
		input: RegisterAttachmentInput,
	) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.registerComment(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				params.commentId,
				c.get("session").user.id,
				input,
				backgroundFromContext(c),
			),
		);
	},

	listComment: async (c: ParamContext<CommentParams>) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.listComment(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
				params.commentId,
			),
		);
	},

	removeComment: async (c: ParamContext<CommentAttachmentParams>) => {
		const orgMember = c.get("orgMember");
		const params = c.req.valid("param");
		return ok(
			c,
			await service.removeComment(
				orgMember.orgId,
				params.projectId,
				params.number,
				params.commentId,
				params.attachmentId,
				{ userId: orgMember.userId, role: orgMember.role },
			),
		);
	},
});
