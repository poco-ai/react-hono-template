import {
	createCycleSchema,
	cycleListQuerySchema,
	rolloverCycleSchema,
	updateCycleSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { createCycleController } from "../controllers/cycle.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import { requireOrgRole } from "../middleware/org";
import type { CycleService } from "../services/cycle.service";

export const createCyclesRoutes = (service: CycleService) => {
	const controller = createCycleController(service);
	const canWrite = requireOrgRole("owner", "admin");
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/cycles",
			validate(cycleListQuerySchema, "query"),
			(c) => controller.list(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/cycles",
			canWrite,
			validate(createCycleSchema, "json"),
			(c) => controller.create(c, c.req.valid("json")),
		)
		.get("/api/orgs/:orgId/projects/:projectId/cycles/:cycleId", (c) =>
			controller.get(c),
		)
		.patch(
			"/api/orgs/:orgId/projects/:projectId/cycles/:cycleId",
			canWrite,
			validate(updateCycleSchema, "json"),
			(c) => controller.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/cycles/:cycleId",
			canWrite,
			(c) => controller.remove(c),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/cycles/:cycleId/rollover",
			canWrite,
			validate(rolloverCycleSchema, "json"),
			(c) => controller.rollover(c, c.req.valid("json")),
		);
};
