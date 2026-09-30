import type {
	AttachmentPresignInput,
	RegisterAttachmentInput,
} from "@workspace/shared";
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
import type { AttachmentService } from "../services/attachment.service";

type Env = SessionEnv & OrgEnv;

export const createAttachmentController = (service: AttachmentService) => ({
	list: async (c: Context<Env>) =>
		ok(
			c,
			await service.list(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireIssueNumber(c),
			),
		),

	presign: async (c: Context<Env>, input: AttachmentPresignInput) =>
		ok(
			c,
			await service.presignUpload(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireIssueNumber(c),
				input,
			),
		),

	register: async (c: Context<Env>, input: RegisterAttachmentInput) =>
		ok(
			c,
			await service.register(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireIssueNumber(c),
				c.get("session").user.id,
				input,
				backgroundFromContext(c),
			),
		),

	remove: async (c: Context<Env>) => {
		const orgMember = c.get("orgMember");
		return ok(
			c,
			await service.remove(
				orgMember.orgId,
				requireProjectId(c),
				requireIssueNumber(c),
				requireParam(c, "attachmentId"),
				{ userId: orgMember.userId, role: orgMember.role },
			),
		);
	},
});
