import {
	createProjectUpdateSchema,
	projectUpdateListQuerySchema,
	updateProjectUpdateSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { projectParams, projectUpdateParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { createProjectUpdateController } from "../controllers/project-update.controller";
import type { ProjectUpdateService } from "../services/project-update.service";

export const createProjectUpdatesRoutes = (service: ProjectUpdateService) => {
	const controller = createProjectUpdateController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/updates",
			validate(projectParams, "param"),
			validate(projectUpdateListQuerySchema, "query"),
			(c) => controller.list(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/updates",
			validate(projectParams, "param"),
			validate(createProjectUpdateSchema, "json"),
			(c) => controller.create(c, c.req.valid("json")),
		)
		.patch(
			"/api/orgs/:orgId/projects/:projectId/updates/:updateId",
			validate(projectUpdateParams, "param"),
			validate(updateProjectUpdateSchema, "json"),
			(c) => controller.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/updates/:updateId",
			validate(projectUpdateParams, "param"),
			(c) => controller.remove(c),
		);
};
