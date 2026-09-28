import {
	type ActivityListQuery,
	ApiError,
	ApiErrorCode,
} from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { ActivityService } from "../services/activity.service";

type Env = SessionEnv & OrgEnv;

const requireProjectId = (c: Context<Env>) => {
	const projectId = c.req.param("projectId");
	if (!projectId) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			"Missing required param: projectId",
		);
	}
	return projectId;
};

const requireIssueNumber = (c: Context<Env>) => {
	const raw = c.req.param("number");
	const number = Number(raw);
	if (!/^\d+$/.test(raw ?? "") || !Number.isInteger(number) || number < 1) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			"Issue number must be a positive integer",
		);
	}
	return number;
};

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

export type ActivityController = ReturnType<typeof createActivityController>;
