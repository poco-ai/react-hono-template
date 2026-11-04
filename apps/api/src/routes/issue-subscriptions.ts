import { updateIssueSubscriptionSchema } from "@workspace/shared";
import { Hono } from "hono";
import { createIssueSubscriptionController } from "../controllers/issue-subscription.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { IssueSubscriptionService } from "../services/issue-subscription.service";

export const createIssueSubscriptionsRoutes = (
	service: IssueSubscriptionService,
) => {
	const controller = createIssueSubscriptionController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/subscription",
			(c) => controller.get(c),
		)
		.put(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/subscription",
			validate(updateIssueSubscriptionSchema, "json"),
			(c) => controller.update(c, c.req.valid("json")),
		);
};
