import { Hono } from "hono";
import { createBillingController } from "../controllers/billing.controller";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import { requireOrgRole } from "../middleware/org";
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
