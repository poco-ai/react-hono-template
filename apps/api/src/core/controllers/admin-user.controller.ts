import type {
	AdminUserListQuery,
	BanAdminUserInput,
	UpdateAdminUserRoleInput,
} from "@workspace/shared";
import type { Context } from "hono";
import type { AdminUserParams, ParamContext } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { AdminUserService } from "../services/admin-user.service";

export const createAdminController = (service: AdminUserService) => ({
	list: async (c: Context, query: AdminUserListQuery) =>
		ok(c, await service.listUsers({ ...query, search: query.search ?? "" })),

	updateRole: async (
		c: ParamContext<AdminUserParams, SessionEnv>,
		input: UpdateAdminUserRoleInput,
	) =>
		ok(
			c,
			await service.updateRole(
				c.get("session").user.id,
				c.req.valid("param").id,
				input.role,
			),
		),

	ban: async (
		c: ParamContext<AdminUserParams, SessionEnv>,
		input: BanAdminUserInput,
	) =>
		ok(
			c,
			await service.banUser(
				c.get("session").user.id,
				c.req.valid("param").id,
				input.banReason,
			),
		),

	unban: async (c: ParamContext<AdminUserParams, SessionEnv>) =>
		ok(c, await service.unbanUser(c.req.valid("param").id)),
});
