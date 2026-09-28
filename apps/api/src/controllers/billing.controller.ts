import type { Context } from "hono";
import type { MemberDao } from "../dao/member.dao";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { BillingService } from "../services/billing.service";

type Env = SessionEnv & OrgEnv;

export const createBillingController = ({
	service,
	memberDao,
}: {
	service: BillingService;
	memberDao: MemberDao;
}) => ({
	get: async (c: Context<Env>) =>
		ok(c, await service.getBilling(c.get("orgMember").orgId)),

	checkout: async (c: Context<Env>) => {
		const orgId = c.get("orgMember").orgId;
		const ownerEmail = await memberDao.findOwnerEmail(orgId);
		const origin = c.req.header("origin") ?? new URL(c.req.url).origin;
		return ok(c, await service.createCheckout(orgId, ownerEmail, origin));
	},

	portal: async (c: Context<Env>) => {
		const orgId = c.get("orgMember").orgId;
		const origin = c.req.header("origin") ?? new URL(c.req.url).origin;
		return ok(c, await service.createPortal(orgId, origin));
	},
});

export type BillingController = ReturnType<typeof createBillingController>;
