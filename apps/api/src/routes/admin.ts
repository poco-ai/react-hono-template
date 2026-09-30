import {
	adminOrgListQuerySchema,
	adminUserListQuerySchema,
	banAdminUserSchema,
	updateAdminUserRoleSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { createAdminOrgController } from "../controllers/admin-org.controller";
import { createAdminController } from "../controllers/admin-user.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import { requirePermission } from "../middleware/auth";
import type { AdminOrgService } from "../services/admin-org.service";
import type { AdminUserService } from "../services/admin-user.service";

export const createAdminRoutes = ({
	users,
	orgs,
}: {
	users: AdminUserService;
	orgs: AdminOrgService;
}) => {
	const adminController = createAdminController(users);
	const adminOrgController = createAdminOrgController(orgs);
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
			validate(updateAdminUserRoleSchema, "json"),
			(c) => adminController.updateRole(c, c.req.valid("json")),
		)
		.post(
			"/api/admin/users/:id/ban",
			requirePermission({ user: ["ban"] }),
			validate(banAdminUserSchema, "json"),
			(c) => adminController.ban(c, c.req.valid("json")),
		)
		.delete(
			"/api/admin/users/:id/ban",
			requirePermission({ user: ["ban"] }),
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
			(c) => adminOrgController.freeze(c),
		)
		.delete(
			"/api/admin/orgs/:orgId/freeze",
			requirePermission({ org: ["freeze"] }),
			(c) => adminOrgController.unfreeze(c),
		)
		.get("/api/admin/stats", requirePermission({ org: ["stats"] }), (c) =>
			adminOrgController.stats(c),
		);
};
