import {
	ApiError,
	ApiErrorCode,
	type AttachmentPresignInput,
	type RegisterAttachmentInput,
} from "@workspace/shared";
import type { Context } from "hono";
import { backgroundFromContext } from "../lib/background";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { AttachmentService } from "../services/attachment.service";

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

const requireAttachmentId = (c: Context<Env>) => {
	const attachmentId = c.req.param("attachmentId");
	if (!attachmentId) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			"Missing required param: attachmentId",
		);
	}
	return attachmentId;
};

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
				requireAttachmentId(c),
				{ userId: orgMember.userId, role: orgMember.role },
			),
		);
	},
});

export type AttachmentController = ReturnType<
	typeof createAttachmentController
>;
