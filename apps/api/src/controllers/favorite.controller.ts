import {
	ApiError,
	ApiErrorCode,
	type CreateFavoriteInput,
	FAVORITE_ENTITY_TYPES,
	type FavoriteEntityType,
} from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { FavoriteService } from "../services/favorite.service";

type Env = SessionEnv & OrgEnv;

const requireEntityType = (c: Context<Env>): FavoriteEntityType => {
	const value = c.req.param("entityType") ?? "";
	if (!(FAVORITE_ENTITY_TYPES as readonly string[]).includes(value)) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			`entityType must be one of ${FAVORITE_ENTITY_TYPES.join(", ")}`,
		);
	}
	return value as FavoriteEntityType;
};

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
