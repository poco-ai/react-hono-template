import { activityListQuerySchema } from "@workspace/shared";
import { Hono } from "hono";
import { createActivityController } from "../controllers/activity.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { ActivityService } from "../services/activity.service";

export const createActivitiesRoutes = (service: ActivityService) => {
	const activityController = createActivityController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/activities",
			(c) => activityController.listByIssue(c),
		)
		.get(
			"/api/orgs/:orgId/activities",
			validate(activityListQuerySchema, "query"),
			(c) => activityController.listByOrg(c, c.req.valid("query")),
		);
};
