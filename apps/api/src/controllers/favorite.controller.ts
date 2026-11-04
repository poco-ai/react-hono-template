import type {
	CreateFavoriteInput,
	FavoriteEntityType,
} from "@workspace/shared";
import { FAVORITE_ENTITY_TYPES } from "@workspace/shared";
import type { Context } from "hono";
import { requireEnumParamValue } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { FavoriteService } from "../services/favorite.service";

type Env = SessionEnv & OrgEnv;

const requireEntityType = (c: Context<Env>): FavoriteEntityType =>
	requireEnumParamValue(
		c.req.param("entityType"),
		"entityType",
		FAVORITE_ENTITY_TYPES,
	);

export const createFavoriteController = (service: FavoriteService) => ({
	list: async (c: Context<Env>) =>
		ok(
			c,
			await service.listFavorites(
				c.get("orgMember").orgId,
				c.get("session").user.id,
			),
		),

	create: async (c: Context<Env>, input: CreateFavoriteInput) =>
		ok(
			c,
			await service.addFavorite(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				input,
			),
		),

	remove: async (c: Context<Env>) =>
		ok(
			c,
			await service.removeFavorite(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				requireEntityType(c),
				c.req.param("entityId") ?? "",
			),
		),
});
