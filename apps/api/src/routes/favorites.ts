import { createFavoriteSchema } from "@workspace/shared";
import { Hono } from "hono";
import { createFavoriteController } from "../controllers/favorite.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { FavoriteService } from "../services/favorite.service";

export const createFavoritesRoutes = (service: FavoriteService) => {
	const controller = createFavoriteController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get("/api/orgs/:orgId/favorites", (c) => controller.list(c))
		.post(
			"/api/orgs/:orgId/favorites",
			validate(createFavoriteSchema, "json"),
			(c) => controller.create(c, c.req.valid("json")),
		)
		.delete("/api/orgs/:orgId/favorites/:entityType/:entityId", (c) =>
			controller.remove(c),
		);
};
