import { roadmapQuerySchema } from "@workspace/shared";
import { Hono } from "hono";
import { createRoadmapController } from "../controllers/roadmap.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { RoadmapService } from "../services/roadmap.service";

/** Org members read the roadmap; it is a read-only aggregate. */
export const createRoadmapRoutes = (service: RoadmapService) => {
	const controller = createRoadmapController(service);
	return new Hono<SessionEnv & OrgEnv>().get(
		"/api/orgs/:orgId/roadmap",
		validate(roadmapQuerySchema, "query"),
		(c) => controller.get(c, c.req.valid("query")),
	);
};
