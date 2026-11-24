import { updateIssueSubscriptionSchema } from "@workspace/shared";
import { Hono } from "hono";
import { issueParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { createIssueSubscriptionController } from "../controllers/issue-subscription.controller";
import type { IssueSubscriptionService } from "../services/issue-subscription.service";

export const createIssueSubscriptionsRoutes = (
	service: IssueSubscriptionService,
) => {
	const controller = createIssueSubscriptionController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/subscription",
			validate(issueParams, "param"),
			(c) => controller.get(c),
		)
		.put(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/subscription",
			validate(issueParams, "param"),
			validate(updateIssueSubscriptionSchema, "json"),
			(c) => controller.update(c, c.req.valid("json")),
		);
};
