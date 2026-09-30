import type { ActivityListQuery } from "@workspace/shared";
import type { Context } from "hono";
import { requireIssueNumber, requireProjectId } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { ActivityService } from "../services/activity.service";

type Env = SessionEnv & OrgEnv;

export const createActivityController = (service: ActivityService) => ({
	listByIssue: async (c: Context<Env>) =>
		ok(
			c,
			await service.listByIssue(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireIssueNumber(c),
			),
		),

	listByOrg: async (c: Context<Env>, query: ActivityListQuery) =>
		ok(c, await service.listByOrg(c.get("orgMember").orgId, query)),
});
