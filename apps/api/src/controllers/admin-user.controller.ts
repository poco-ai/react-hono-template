import type {
	AdminUserListQuery,
	BanAdminUserInput,
	UpdateAdminUserRoleInput,
} from "@workspace/shared";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { AdminUserService } from "../services/admin-user.service";

const requireId = (c: Context) => {
	const id = c.req.param("id");
	if (!id) {
		throw new ApiError(400, ApiErrorCode.INVALID_PARAM, "Missing user id");
	}
	return id;
};

export const createAdminController = (service: AdminUserService) => ({
	list: async (c: Context, query: AdminUserListQuery) =>
		ok(c, await service.listUsers({ ...query, search: query.search ?? "" })),

	updateRole: async (c: Context<SessionEnv>, input: UpdateAdminUserRoleInput) =>
		ok(
			c,
			await service.updateRole(
				c.get("session").user.id,
				requireId(c),
				input.role,
			),
		),

	ban: async (c: Context<SessionEnv>, input: BanAdminUserInput) =>
		ok(
			c,
			await service.banUser(
				c.get("session").user.id,
				requireId(c),
				input.banReason,
			),
		),

	unban: async (c: Context) => ok(c, await service.unbanUser(requireId(c))),
});

export type AdminController = ReturnType<typeof createAdminController>;
