import type { CreateFavoriteInput } from "@workspace/shared";
import type { Context } from "hono";
import type { FavoriteParams, ParamContext } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { FavoriteService } from "../services/favorite.service";

type Env = SessionEnv & OrgEnv;

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

	remove: async (c: ParamContext<FavoriteParams>) => {
		const params = c.req.valid("param");
		return ok(
			c,
			await service.removeFavorite(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				params.entityType,
				params.entityId,
			),
		);
	},
});
