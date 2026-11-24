import {
	createCycleSchema,
	cycleListQuerySchema,
	rolloverCycleSchema,
	updateCycleSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { cycleParams, projectParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { requireOrgRole } from "../../../core/middleware/org";
import { createCycleController } from "../controllers/cycle.controller";
import type { CycleService } from "../services/cycle.service";

export const createCyclesRoutes = (service: CycleService) => {
	const controller = createCycleController(service);
	const canWrite = requireOrgRole("owner", "admin");
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/cycles",
			validate(projectParams, "param"),
			validate(cycleListQuerySchema, "query"),
			(c) => controller.list(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/cycles",
			canWrite,
			validate(projectParams, "param"),
			validate(createCycleSchema, "json"),
			(c) => controller.create(c, c.req.valid("json")),
		)
		.get(
			"/api/orgs/:orgId/projects/:projectId/cycles/:cycleId",
			validate(cycleParams, "param"),
			(c) => controller.get(c),
		)
		.patch(
			"/api/orgs/:orgId/projects/:projectId/cycles/:cycleId",
			canWrite,
			validate(cycleParams, "param"),
			validate(updateCycleSchema, "json"),
			(c) => controller.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/cycles/:cycleId",
			canWrite,
			validate(cycleParams, "param"),
			(c) => controller.remove(c),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/cycles/:cycleId/rollover",
			canWrite,
			validate(cycleParams, "param"),
			validate(rolloverCycleSchema, "json"),
			(c) => controller.rollover(c, c.req.valid("json")),
		);
};
