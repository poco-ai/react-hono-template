import type { AdminOrgListQuery } from "@workspace/shared";
import type { Context } from "hono";
import { requireParamValue } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { AdminOrgService } from "../services/admin-org.service";

type Env = SessionEnv;

const requireOrgId = (c: Context<Env>) =>
	requireParamValue(c.req.param("orgId"), "orgId");

export const createAdminOrgController = (service: AdminOrgService) => ({
	list: async (c: Context<Env>, query: AdminOrgListQuery) =>
		ok(c, await service.listOrgs(query)),

	freeze: async (c: Context<Env>) =>
		ok(c, await service.freeze(requireOrgId(c))),

	unfreeze: async (c: Context<Env>) =>
		ok(c, await service.unfreeze(requireOrgId(c))),

	stats: async (c: Context<Env>) => ok(c, await service.stats()),
});
