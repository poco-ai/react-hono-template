import {
	adjustCreditsSchema,
	adminAuditListQuerySchema,
	adminOrgListQuerySchema,
	adminUserListQuerySchema,
	banAdminUserSchema,
	runtimeConfigUpdateSchema,
	updateAdminUserRoleSchema,
	updateQuotaPolicySchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { createAdminOrgController } from "../controllers/admin-org.controller";
import { createAdminController } from "../controllers/admin-user.controller";
import { createAuditController } from "../controllers/audit.controller";
import { createConfigController } from "../controllers/config.controller";
import { createQuotaController } from "../controllers/quota.controller";
import { adminOrgParams, adminUserParams } from "../lib/params";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import { requirePermission } from "../middleware/auth";
import type { AdminOrgService } from "../services/admin-org.service";
import type { AdminUserService } from "../services/admin-user.service";
import type { AuditService } from "../services/audit.service";
import type { ConfigService } from "../services/config.service";
import type { QuotaService } from "../services/quota.service";

export const createAdminRoutes = ({
	users,
	orgs,
	config,
	audit,
	quota,
}: {
	users: AdminUserService;
	orgs: AdminOrgService;
	config: ConfigService;
	audit: AuditService;
	quota: QuotaService;
}) => {
	const adminController = createAdminController(users);
	const adminOrgController = createAdminOrgController(orgs);
	const configController = createConfigController(config);
	const auditController = createAuditController(audit);
	const quotaController = createQuotaController(quota);
	return new Hono<SessionEnv>()
		.get(
			"/api/admin/users",
			requirePermission({ user: ["list"] }),
			validate(adminUserListQuerySchema, "query"),
			(c) =>
				adminController.list(c, {
					...c.req.valid("query"),
					search: c.req.valid("query").search ?? "",
				}),
		)
		.patch(
			"/api/admin/users/:id/role",
			requirePermission({ user: ["set-role"] }),
			validate(adminUserParams, "param"),
			validate(updateAdminUserRoleSchema, "json"),
			(c) => adminController.updateRole(c, c.req.valid("json")),
		)
		.post(
			"/api/admin/users/:id/ban",
			requirePermission({ user: ["ban"] }),
			validate(adminUserParams, "param"),
			validate(banAdminUserSchema, "json"),
			(c) => adminController.ban(c, c.req.valid("json")),
		)
		.delete(
			"/api/admin/users/:id/ban",
			requirePermission({ user: ["ban"] }),
			validate(adminUserParams, "param"),
			(c) => adminController.unban(c),
		)
		.get(
			"/api/admin/orgs",
			requirePermission({ org: ["list"] }),
			validate(adminOrgListQuerySchema, "query"),
			(c) => adminOrgController.list(c, c.req.valid("query")),
		)
		.post(
			"/api/admin/orgs/:orgId/freeze",
			requirePermission({ org: ["freeze"] }),
			validate(adminOrgParams, "param"),
			(c) => adminOrgController.freeze(c),
		)
		.delete(
			"/api/admin/orgs/:orgId/freeze",
			requirePermission({ org: ["freeze"] }),
			validate(adminOrgParams, "param"),
			(c) => adminOrgController.unfreeze(c),
		)
		.get("/api/admin/stats", requirePermission({ org: ["stats"] }), (c) =>
			adminOrgController.stats(c),
		)
		.put(
			"/api/admin/config",
			requirePermission({ config: ["write"] }),
			validate(runtimeConfigUpdateSchema, "json"),
			(c) => configController.update(c, c.req.valid("json")),
		)
		.get(
			"/api/admin/audit",
			requirePermission({ org: ["list"] }),
			validate(adminAuditListQuerySchema, "query"),
			(c) => auditController.listForAdmin(c, c.req.valid("query")),
		)
		.get(
			"/api/admin/audit/export",
			requirePermission({ org: ["list"] }),
			validate(adminAuditListQuerySchema, "query"),
			(c) => auditController.exportForAdmin(c, c.req.valid("query")),
		)
		.get(
			"/api/admin/orgs/:orgId/quota",
			requirePermission({ org: ["quota"] }),
			validate(adminOrgParams, "param"),
			(c) => quotaController.overview(c),
		)
		.post(
			"/api/admin/orgs/:orgId/credits",
			requirePermission({ org: ["quota"] }),
			validate(adminOrgParams, "param"),
			validate(adjustCreditsSchema, "json"),
			(c) => quotaController.adjustCredits(c, c.req.valid("json")),
		)
		.put(
			"/api/admin/orgs/:orgId/quota",
			requirePermission({ org: ["quota"] }),
			validate(adminOrgParams, "param"),
			validate(updateQuotaPolicySchema, "json"),
			(c) => quotaController.setPolicy(c, c.req.valid("json")),
		);
};
