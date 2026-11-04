import type {
	CreateIssueTemplateInput,
	IssueTemplateListQuery,
	UpdateIssueTemplateInput,
} from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { IssueTemplateService } from "../services/issue-template.service";

type Env = SessionEnv & OrgEnv;

const templateId = (c: Context<Env>) => c.req.param("templateId") ?? "";

export const createIssueTemplateController = (
	service: IssueTemplateService,
) => ({
	list: async (c: Context<Env>, query: IssueTemplateListQuery) =>
		ok(c, await service.listTemplates(c.get("orgMember").orgId, query)),

	create: async (c: Context<Env>, input: CreateIssueTemplateInput) =>
		ok(
			c,
			await service.createTemplate(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				input,
			),
		),

	update: async (c: Context<Env>, input: UpdateIssueTemplateInput) =>
		ok(
			c,
			await service.updateTemplate(
				c.get("orgMember").orgId,
				templateId(c),
				input,
			),
		),

	remove: async (c: Context<Env>) => {
		await service.deleteTemplate(c.get("orgMember").orgId, templateId(c));
		return ok(c, { deleted: true });
	},
});
