import { createProjectSchema, updateProjectSchema } from "@workspace/shared";
import { Hono } from "hono";
import { projectParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { requireOrgRole } from "../../../core/middleware/org";
import { createProjectController } from "../controllers/project.controller";
import type { ProjectService } from "../services/project.service";

export const createProjectsRoutes = (service: ProjectService) => {
	const projectController = createProjectController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get("/api/orgs/:orgId/projects", (c) => projectController.list(c))
		.post(
			"/api/orgs/:orgId/projects",
			requireOrgRole("owner", "admin"),
			validate(createProjectSchema, "json"),
			(c) => projectController.create(c, c.req.valid("json")),
		)
		.get(
			"/api/orgs/:orgId/projects/:projectId",
			validate(projectParams, "param"),
			(c) => projectController.get(c),
		)
		.patch(
			"/api/orgs/:orgId/projects/:projectId",
			requireOrgRole("owner", "admin"),
			validate(projectParams, "param"),
			validate(updateProjectSchema, "json"),
			(c) => projectController.update(c, c.req.valid("json")),
		);
};
