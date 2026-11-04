import type { UpdateIssueSubscriptionInput } from "@workspace/shared";
import type { Context } from "hono";
import { requireIssueNumber, requireProjectId } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { IssueSubscriptionService } from "../services/issue-subscription.service";

type Env = SessionEnv & OrgEnv;

export const createIssueSubscriptionController = (
	service: IssueSubscriptionService,
) => ({
	get: async (c: Context<Env>) =>
		ok(
			c,
			await service.getSubscription(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireIssueNumber(c),
				c.get("session").user.id,
			),
		),

	update: async (c: Context<Env>, input: UpdateIssueSubscriptionInput) =>
		ok(
			c,
			await service.updateSubscription(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireIssueNumber(c),
				c.get("session").user.id,
				input,
			),
		),
});
