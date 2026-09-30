import { commentListQuerySchema, createCommentSchema } from "@workspace/shared";
import { Hono } from "hono";
import { createCommentController } from "../controllers/comment.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { CommentService } from "../services/comment.service";

export const createCommentsRoutes = (service: CommentService) => {
	const commentController = createCommentController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments",
			validate(commentListQuerySchema, "query"),
			(c) => commentController.list(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments",
			validate(createCommentSchema, "json"),
			(c) => commentController.create(c, c.req.valid("json")),
		)
		.patch(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId",
			validate(createCommentSchema, "json"),
			(c) => commentController.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId",
			(c) => commentController.remove(c),
		);
};
