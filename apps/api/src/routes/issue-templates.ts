import {
	createIssueTemplateSchema,
	issueTemplateListQuerySchema,
	updateIssueTemplateSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { createIssueTemplateController } from "../controllers/issue-template.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import { requireOrgRole } from "../middleware/org";
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
			validate(updateIssueTemplateSchema, "json"),
			(c) => controller.update(c, c.req.valid("json")),
		)
		.delete("/api/orgs/:orgId/issue-templates/:templateId", canWrite, (c) =>
			controller.remove(c),
		);
};
