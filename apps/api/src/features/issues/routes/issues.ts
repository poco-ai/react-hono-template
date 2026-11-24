import {
	createIssueSchema,
	importIssuesSchema,
	issueListQuerySchema,
	triageQuerySchema,
	updateIssueSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { issueParams, projectParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { createIssueController } from "../controllers/issue.controller";
import type { IssueService } from "../services/issue.service";

export const createIssuesRoutes = (service: IssueService) => {
	const issueController = createIssueController(service);
	return (
		new Hono<SessionEnv & OrgEnv>()
			.get(
				"/api/orgs/:orgId/projects/:projectId/issues",
				validate(projectParams, "param"),
				validate(issueListQuerySchema, "query"),
				(c) => issueController.listByProject(c, c.req.valid("query")),
			)
			.post(
				"/api/orgs/:orgId/projects/:projectId/issues",
				validate(projectParams, "param"),
				validate(createIssueSchema, "json"),
				(c) => issueController.create(c, c.req.valid("json")),
			)
			// Static paths are registered before `:number` so `export.csv` never
			// reaches the issue-detail handler.
			.get(
				"/api/orgs/:orgId/projects/:projectId/issues/export.csv",
				validate(projectParams, "param"),
				(c) => issueController.exportCsv(c),
			)
			.post(
				"/api/orgs/:orgId/projects/:projectId/issues/import",
				validate(projectParams, "param"),
				validate(importIssuesSchema, "json"),
				(c) => issueController.import(c, c.req.valid("json")),
			)
			.get(
				"/api/orgs/:orgId/projects/:projectId/issues/:number",
				validate(issueParams, "param"),
				(c) => issueController.get(c),
			)
			.patch(
				"/api/orgs/:orgId/projects/:projectId/issues/:number",
				validate(issueParams, "param"),
				validate(updateIssueSchema, "json"),
				(c) => issueController.update(c, c.req.valid("json")),
			)
			.delete(
				"/api/orgs/:orgId/projects/:projectId/issues/:number",
				validate(issueParams, "param"),
				(c) => issueController.remove(c),
			)
			.post(
				"/api/orgs/:orgId/projects/:projectId/issues/:number/archive",
				validate(issueParams, "param"),
				(c) => issueController.archive(c),
			)
			.post(
				"/api/orgs/:orgId/projects/:projectId/issues/:number/restore",
				validate(issueParams, "param"),
				(c) => issueController.restore(c),
			)
			.get(
				"/api/orgs/:orgId/issues",
				validate(issueListQuerySchema, "query"),
				(c) => issueController.listByOrg(c, c.req.valid("query")),
			)
			.get(
				"/api/orgs/:orgId/triage",
				validate(triageQuerySchema, "query"),
				(c) => issueController.listTriage(c, c.req.valid("query")),
			)
	);
};
