import type { RoadmapQuery } from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../../../core/lib/response";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import type { RoadmapService } from "../services/roadmap.service";

type Env = SessionEnv & OrgEnv;

export const createRoadmapController = (service: RoadmapService) => ({
	get: async (c: Context<Env>, query: RoadmapQuery) =>
		ok(c, await service.getRoadmap(c.get("orgMember").orgId, query)),
});
