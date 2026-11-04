import {
	createProjectUpdateSchema,
	projectUpdateListQuerySchema,
	updateProjectUpdateSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { createProjectUpdateController } from "../controllers/project-update.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { ProjectUpdateService } from "../services/project-update.service";

export const createProjectUpdatesRoutes = (service: ProjectUpdateService) => {
	const controller = createProjectUpdateController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/updates",
			validate(projectUpdateListQuerySchema, "query"),
			(c) => controller.list(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/updates",
			validate(createProjectUpdateSchema, "json"),
			(c) => controller.create(c, c.req.valid("json")),
		)
		.patch(
			"/api/orgs/:orgId/projects/:projectId/updates/:updateId",
			validate(updateProjectUpdateSchema, "json"),
			(c) => controller.update(c, c.req.valid("json")),
		)
		.delete("/api/orgs/:orgId/projects/:projectId/updates/:updateId", (c) =>
			controller.remove(c),
		);
};
