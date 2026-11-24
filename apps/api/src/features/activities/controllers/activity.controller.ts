import type { ActivityListQuery } from "@workspace/shared";
import type { Context } from "hono";
import type { IssueParams, ParamContext } from "../../../core/lib/params";
import { ok } from "../../../core/lib/response";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import type { ActivityService } from "../services/activity.service";

type Env = SessionEnv & OrgEnv;

export const createActivityController = (service: ActivityService) => ({
	listByIssue: async (c: ParamContext<IssueParams>) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.listByIssue(
				c.get("orgMember").orgId,
				params.projectId,
				params.number,
			),
		);
	},

	listByOrg: async (c: Context<Env>, query: ActivityListQuery) =>
		ok(c, await service.listByOrg(c.get("orgMember").orgId, query)),
});
