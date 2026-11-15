import type { AdminOrgListQuery } from "@workspace/shared";
import type { Context } from "hono";
import type { AdminOrgParams, ParamContext } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { AdminOrgService } from "../services/admin-org.service";

type Env = SessionEnv;

export const createAdminOrgController = (service: AdminOrgService) => ({
	list: async (c: Context<Env>, query: AdminOrgListQuery) =>
		ok(c, await service.listOrgs(query)),

	freeze: async (c: ParamContext<AdminOrgParams, Env>) =>
		ok(c, await service.freeze(c.req.valid("param").orgId)),

	unfreeze: async (c: ParamContext<AdminOrgParams, Env>) =>
		ok(c, await service.unfreeze(c.req.valid("param").orgId)),

	stats: async (c: Context<Env>) => ok(c, await service.stats()),
});
