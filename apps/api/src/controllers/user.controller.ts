import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { UserService } from "../services/user.service";

export const createUserController = (service: UserService) => ({
	list: async (c: Context) => ok(c, await service.listUsers()),
	getById: async (c: Context) => {
		const id = Number(c.req.param("id"));
		if (!Number.isInteger(id) || id < 1) {
			throw new ApiError(
				400,
				ApiErrorCode.INVALID_PARAM,
				"User id must be a positive integer",
			);
		}
		return ok(c, await service.getUser(id));
	},
});

export type UserController = ReturnType<typeof createUserController>;
