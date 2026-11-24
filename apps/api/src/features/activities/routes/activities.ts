import { activityListQuerySchema } from "@workspace/shared";
import { Hono } from "hono";
import { issueParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { createActivityController } from "../controllers/activity.controller";
import type { ActivityService } from "../services/activity.service";

export const createActivitiesRoutes = (service: ActivityService) => {
	const activityController = createActivityController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/activities",
			validate(issueParams, "param"),
			(c) => activityController.listByIssue(c),
		)
		.get(
			"/api/orgs/:orgId/activities",
			validate(activityListQuerySchema, "query"),
			(c) => activityController.listByOrg(c, c.req.valid("query")),
		);
};
