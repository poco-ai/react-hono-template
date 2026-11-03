import {
	attachmentPresignSchema,
	registerAttachmentSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { createAttachmentController } from "../controllers/attachment.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { AttachmentService } from "../services/attachment.service";

export const createAttachmentsRoutes = (service: AttachmentService) => {
	const attachmentController = createAttachmentController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/attachments",
			(c) => attachmentController.list(c),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/attachments",
			validate(registerAttachmentSchema, "json"),
			(c) => attachmentController.register(c, c.req.valid("json")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/attachments/presign",
			validate(attachmentPresignSchema, "json"),
			(c) => attachmentController.presign(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/attachments/:attachmentId",
			(c) => attachmentController.remove(c),
		)
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId/attachments",
			(c) => attachmentController.listComment(c),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId/attachments",
			validate(registerAttachmentSchema, "json"),
			(c) => attachmentController.registerComment(c, c.req.valid("json")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId/attachments/presign",
			validate(attachmentPresignSchema, "json"),
			(c) => attachmentController.presignComment(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId/attachments/:attachmentId",
			(c) => attachmentController.removeComment(c),
		);
};
