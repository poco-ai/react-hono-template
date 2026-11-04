import { createIssueRelationSchema } from "@workspace/shared";
import { Hono } from "hono";
import { createRelationController } from "../controllers/relation.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { RelationService } from "../services/relation.service";

export const createRelationsRoutes = (service: RelationService) => {
	const controller = createRelationController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get("/api/orgs/:orgId/projects/:projectId/issues/:number/relations", (c) =>
			controller.list(c),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/relations",
			validate(createIssueRelationSchema, "json"),
			(c) => controller.create(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/relations/:relationId",
			(c) => controller.remove(c),
		);
};
