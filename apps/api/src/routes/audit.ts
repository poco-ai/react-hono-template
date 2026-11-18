import { auditListQuerySchema } from "@workspace/shared";
import { Hono } from "hono";
import { createAuditController } from "../controllers/audit.controller";
import { orgParams } from "../lib/params";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import { requireOrgRole } from "../middleware/org";
import type { AuditService } from "../services/audit.service";

export const createAuditRoutes = (service: AuditService) => {
	const controller = createAuditController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/audit",
			requireOrgRole("owner", "admin"),
			validate(orgParams, "param"),
			validate(auditListQuerySchema, "query"),
			(c) => controller.listForOrg(c, c.req.valid("query")),
		)
		.get(
			"/api/orgs/:orgId/audit/export",
			requireOrgRole("owner", "admin"),
			validate(orgParams, "param"),
			validate(auditListQuerySchema, "query"),
			(c) => controller.exportForOrg(c, c.req.valid("query")),
		);
};
