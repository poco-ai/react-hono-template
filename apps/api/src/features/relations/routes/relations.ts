import { createIssueRelationSchema } from "@workspace/shared";
import { Hono } from "hono";
import { issueParams, relationParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { createRelationController } from "../controllers/relation.controller";
import type { RelationService } from "../services/relation.service";

export const createRelationsRoutes = (service: RelationService) => {
	const controller = createRelationController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/relations",
			validate(issueParams, "param"),
			(c) => controller.list(c),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/relations",
			validate(issueParams, "param"),
			validate(createIssueRelationSchema, "json"),
			(c) => controller.create(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/relations/:relationId",
			validate(relationParams, "param"),
			(c) => controller.remove(c),
		);
};
