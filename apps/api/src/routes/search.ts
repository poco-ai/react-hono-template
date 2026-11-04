import { searchQuerySchema } from "@workspace/shared";
import { Hono } from "hono";
import { createSearchController } from "../controllers/search.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { SearchService } from "../services/search.service";

export const createSearchRoutes = (service: SearchService) => {
	const searchController = createSearchController(service);
	return new Hono<SessionEnv & OrgEnv>().get(
		"/api/orgs/:orgId/search",
		validate(searchQuerySchema, "query"),
		(c) => searchController.search(c, c.req.valid("query")),
	);
};
