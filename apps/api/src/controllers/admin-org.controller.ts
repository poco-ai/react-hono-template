import type { AdminOrgListQuery } from "@workspace/shared";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { AdminOrgService } from "../services/admin-org.service";

type Env = SessionEnv;

const requireOrgId = (c: Context<Env>) => {
	const orgId = c.req.param("orgId");
	if (!orgId) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			"Missing required param: orgId",
		);
	}
	return orgId;
};

export const createAdminOrgController = (service: AdminOrgService) => ({
	list: async (c: Context<Env>, query: AdminOrgListQuery) =>
		ok(c, await service.listOrgs(query)),

	freeze: async (c: Context<Env>) =>
		ok(c, await service.freeze(requireOrgId(c))),

	unfreeze: async (c: Context<Env>) =>
		ok(c, await service.unfreeze(requireOrgId(c))),

	stats: async (c: Context<Env>) => ok(c, await service.stats()),
});

export type AdminOrgController = ReturnType<typeof createAdminOrgController>;
