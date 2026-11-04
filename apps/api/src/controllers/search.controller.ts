import type { SearchQueryInput } from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { SearchService } from "../services/search.service";

type Env = SessionEnv & OrgEnv;

export const createSearchController = (service: SearchService) => ({
	search: async (c: Context<Env>, input: SearchQueryInput) =>
		ok(c, await service.searchAll(c.get("orgMember").orgId, input)),
});
