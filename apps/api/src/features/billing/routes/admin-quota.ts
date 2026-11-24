import {
	adjustCreditsSchema,
	updateQuotaPolicySchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { adminOrgParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import { requirePermission } from "../../../core/middleware/auth";
import { createQuotaController } from "../controllers/quota.controller";
import type { QuotaService } from "../services/quota.service";

/**
 * Admin quota endpoints, contributed by the billing feature at the `admin`
 * mount phase (after the `/api/admin/*` requireAuth gate). Split from
 * core/routes/admin.ts so core no longer reaches into billing.
 */
export const createAdminQuotaRoutes = ({ quota }: { quota: QuotaService }) => {
	const quotaController = createQuotaController(quota);
	return new Hono<SessionEnv>()
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
