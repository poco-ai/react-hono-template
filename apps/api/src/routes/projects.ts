import { createProjectSchema, updateProjectSchema } from "@workspace/shared";
import { Hono } from "hono";
import { createProjectController } from "../controllers/project.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import { requireOrgRole } from "../middleware/org";
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
		.get("/api/orgs/:orgId/projects/:projectId", (c) =>
			projectController.get(c),
		)
		.patch(
			"/api/orgs/:orgId/projects/:projectId",
			requireOrgRole("owner", "admin"),
			validate(updateProjectSchema, "json"),
			(c) => projectController.update(c, c.req.valid("json")),
		);
};
