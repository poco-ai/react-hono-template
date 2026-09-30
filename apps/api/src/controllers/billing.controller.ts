import type { Context } from "hono";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { BillingService } from "../services/billing.service";

type Env = SessionEnv & OrgEnv;

export const createBillingController = (service: BillingService) => ({
	get: async (c: Context<Env>) =>
		ok(c, await service.getBilling(c.get("orgMember").orgId)),

	checkout: async (c: Context<Env>) => {
		const orgId = c.get("orgMember").orgId;
		const origin = c.req.header("origin") ?? new URL(c.req.url).origin;
		return ok(c, await service.createCheckout(orgId, origin));
	},

	portal: async (c: Context<Env>) => {
		const orgId = c.get("orgMember").orgId;
		const origin = c.req.header("origin") ?? new URL(c.req.url).origin;
		return ok(c, await service.createPortal(orgId, origin));
	},
});
