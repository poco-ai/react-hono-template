import type {
	CreateIssueInput,
	IssueListQuery,
	UpdateIssueInput,
} from "@workspace/shared";
import type { Context } from "hono";
import { backgroundFromContext } from "../lib/background";
import { requireIssueNumber, requireProjectId } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { IssueService } from "../services/issue.service";

type Env = SessionEnv & OrgEnv;

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
				backgroundFromContext(c),
			),
		),

	update: async (c: Context<Env>, input: UpdateIssueInput) =>
		ok(
			c,
			await service.updateIssue(
				c.get("orgMember").orgId,
				requireProjectId(c),
				requireIssueNumber(c),
				c.get("session").user.id,
				input,
				backgroundFromContext(c),
			),
		),

	remove: async (c: Context<Env>) => {
		await service.deleteIssue(
			c.get("orgMember").orgId,
			requireProjectId(c),
			requireIssueNumber(c),
			c.get("session").user.id,
			backgroundFromContext(c),
		);
		return ok(c, { deleted: true });
	},
});
