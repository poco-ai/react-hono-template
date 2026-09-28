import {
	ApiError,
	ApiErrorCode,
	type CreateIssueInput,
	type IssueListQuery,
	type UpdateIssueInput,
} from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { IssueService } from "../services/issue.service";

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

export const createIssueController = (service: IssueService) => ({
	listByProject: async (c: Context<Env>, query: IssueListQuery) =>
		ok(
			c,
			await service.listIssues(
				c.get("orgMember").orgId,
				requireProjectId(c),
				query,
			),
		),

	listByOrg: async (c: Context<Env>, query: IssueListQuery) =>
		ok(c, await service.listIssues(c.get("orgMember").orgId, null, query)),

	get: async (c: Context<Env>) =>
		ok(
			c,
			await service.getIssue(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireIssueNumber(c),
			),
		),

	create: async (c: Context<Env>, input: CreateIssueInput) =>
		ok(
			c,
			await service.createIssue(
				c.get("orgMember").orgId,
				requireProjectId(c),
				c.get("session").user.id,
				input,
			),
		),

	update: async (c: Context<Env>, input: UpdateIssueInput) =>
		ok(
			c,
			await service.updateIssue(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireIssueNumber(c),
				input,
			),
		),

	remove: async (c: Context<Env>) => {
		await service.deleteIssue(
			c.get("orgMember").orgId,
			requireProjectId(c),
			requireIssueNumber(c),
		);
		return ok(c, { deleted: true });
	},
});

export type IssueController = ReturnType<typeof createIssueController>;
