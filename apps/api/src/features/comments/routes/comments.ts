import {
	commentListQuerySchema,
	commentReactionSchema,
	createCommentSchema,
	resolveCommentSchema,
	updateCommentSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { commentParams, issueParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { createCommentController } from "../controllers/comment.controller";
import type { CommentService } from "../services/comment.service";

export const createCommentsRoutes = (service: CommentService) => {
	const commentController = createCommentController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments",
			validate(issueParams, "param"),
			validate(commentListQuerySchema, "query"),
			(c) => commentController.list(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments",
			validate(issueParams, "param"),
			validate(createCommentSchema, "json"),
			(c) => commentController.create(c, c.req.valid("json")),
		)
		.patch(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId",
			validate(commentParams, "param"),
			validate(updateCommentSchema, "json"),
			(c) => commentController.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId",
			validate(commentParams, "param"),
			(c) => commentController.remove(c),
		)
		.put(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId/resolve",
			validate(commentParams, "param"),
			validate(resolveCommentSchema, "json"),
			(c) => commentController.resolve(c, c.req.valid("json")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId/reactions",
			validate(commentParams, "param"),
			validate(commentReactionSchema, "json"),
			(c) => commentController.react(c, c.req.valid("json")),
		);
};
