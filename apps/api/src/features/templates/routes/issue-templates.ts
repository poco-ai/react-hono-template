import {
	createIssueTemplateSchema,
	issueTemplateListQuerySchema,
	updateIssueTemplateSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { issueTemplateParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { requireOrgRole } from "../../../core/middleware/org";
import { createIssueTemplateController } from "../controllers/issue-template.controller";
import type { IssueTemplateService } from "../services/issue-template.service";

export const createIssueTemplatesRoutes = (service: IssueTemplateService) => {
	const controller = createIssueTemplateController(service);
	const canWrite = requireOrgRole("owner", "admin");
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/issue-templates",
			validate(issueTemplateListQuerySchema, "query"),
			(c) => controller.list(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/issue-templates",
			canWrite,
			validate(createIssueTemplateSchema, "json"),
			(c) => controller.create(c, c.req.valid("json")),
		)
		.patch(
			"/api/orgs/:orgId/issue-templates/:templateId",
			canWrite,
			validate(issueTemplateParams, "param"),
			validate(updateIssueTemplateSchema, "json"),
			(c) => controller.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/issue-templates/:templateId",
			canWrite,
			validate(issueTemplateParams, "param"),
			(c) => controller.remove(c),
		);
};
