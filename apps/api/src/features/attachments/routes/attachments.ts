import {
	attachmentPresignSchema,
	registerAttachmentSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import {
	attachmentParams,
	commentAttachmentParams,
	commentParams,
	issueParams,
} from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { createAttachmentController } from "../controllers/attachment.controller";
import type { AttachmentService } from "../services/attachment.service";

export const createAttachmentsRoutes = (service: AttachmentService) => {
	const attachmentController = createAttachmentController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/attachments",
			validate(issueParams, "param"),
			(c) => attachmentController.list(c),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/attachments",
			validate(issueParams, "param"),
			validate(registerAttachmentSchema, "json"),
			(c) => attachmentController.register(c, c.req.valid("json")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/attachments/presign",
			validate(issueParams, "param"),
			validate(attachmentPresignSchema, "json"),
			(c) => attachmentController.presign(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/attachments/:attachmentId",
			validate(attachmentParams, "param"),
			(c) => attachmentController.remove(c),
		)
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId/attachments",
			validate(commentParams, "param"),
			(c) => attachmentController.listComment(c),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId/attachments",
			validate(commentParams, "param"),
			validate(registerAttachmentSchema, "json"),
			(c) => attachmentController.registerComment(c, c.req.valid("json")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId/attachments/presign",
			validate(commentParams, "param"),
			validate(attachmentPresignSchema, "json"),
			(c) => attachmentController.presignComment(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId/attachments/:attachmentId",
			validate(commentAttachmentParams, "param"),
			(c) => attachmentController.removeComment(c),
		);
};
