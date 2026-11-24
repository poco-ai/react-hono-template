import { searchQuerySchema } from "@workspace/shared";
import { Hono } from "hono";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { createSearchController } from "../controllers/search.controller";
import type { SearchService } from "../services/search.service";

export const createSearchRoutes = (service: SearchService) => {
	const searchController = createSearchController(service);
	return new Hono<SessionEnv & OrgEnv>().get(
		"/api/orgs/:orgId/search",
		validate(searchQuerySchema, "query"),
		(c) => searchController.search(c, c.req.valid("query")),
	);
};
