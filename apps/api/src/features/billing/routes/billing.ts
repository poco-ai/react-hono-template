import { Hono } from "hono";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { requireOrgRole } from "../../../core/middleware/org";
import { createBillingController } from "../controllers/billing.controller";
import type { BillingService } from "../services/billing.service";

export const createBillingRoutes = (service: BillingService) => {
	const billingController = createBillingController(service);
	// Reads stay open to every org member (the page renders read-only for
	// non-managers); only plan-changing routes require owner/admin.
	return new Hono<SessionEnv & OrgEnv>()
		.get("/api/orgs/:orgId/billing", (c) => billingController.get(c))
		.post(
			"/api/orgs/:orgId/billing/checkout",
			requireOrgRole("owner", "admin"),
			(c) => billingController.checkout(c),
		)
		.post(
			"/api/orgs/:orgId/billing/portal",
			requireOrgRole("owner", "admin"),
			(c) => billingController.portal(c),
		);
};
