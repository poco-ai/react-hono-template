import {
	createIssueSchema,
	issueListQuerySchema,
	updateIssueSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { createIssueController } from "../controllers/issue.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { IssueService } from "../services/issue.service";

export const createIssuesRoutes = (service: IssueService) => {
	const issueController = createIssueController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues",
			validate(issueListQuerySchema, "query"),
			(c) => issueController.listByProject(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues",
			validate(createIssueSchema, "json"),
			(c) => issueController.create(c, c.req.valid("json")),
		)
		.get("/api/orgs/:orgId/projects/:projectId/issues/:number", (c) =>
			issueController.get(c),
		)
		.patch(
			"/api/orgs/:orgId/projects/:projectId/issues/:number",
			validate(updateIssueSchema, "json"),
			(c) => issueController.update(c, c.req.valid("json")),
		)
		.delete("/api/orgs/:orgId/projects/:projectId/issues/:number", (c) =>
			issueController.remove(c),
		)
		.get(
			"/api/orgs/:orgId/issues",
			validate(issueListQuerySchema, "query"),
			(c) => issueController.listByOrg(c, c.req.valid("query")),
		);
};
