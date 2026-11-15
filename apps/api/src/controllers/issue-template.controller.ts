import type {
	CreateIssueTemplateInput,
	IssueTemplateListQuery,
	UpdateIssueTemplateInput,
} from "@workspace/shared";
import type { Context } from "hono";
import type { IssueTemplateParams, ParamContext } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { IssueTemplateService } from "../services/issue-template.service";

type Env = SessionEnv & OrgEnv;

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

	update: async (
		c: ParamContext<IssueTemplateParams>,
		input: UpdateIssueTemplateInput,
	) =>
		ok(
			c,
			await service.updateTemplate(
				c.get("orgMember").orgId,
				c.req.valid("param").templateId,
				input,
			),
		),

	remove: async (c: ParamContext<IssueTemplateParams>) => {
		await service.deleteTemplate(
			c.get("orgMember").orgId,
			c.req.valid("param").templateId,
		);
		return ok(c, { deleted: true });
	},
});
