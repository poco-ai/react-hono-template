import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { Context } from "hono";
import type {
	AdminUserRole,
	BanAdminUserDto,
	UpdateAdminUserRoleDto,
} from "../dto/admin-user.dto";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { AdminUserService } from "../services/admin-user.service";

const ROLES: AdminUserRole[] = ["admin", "user"];

const parsePage = (raw: string | undefined) => {
	const page = Number(raw ?? "1");
	if (!Number.isInteger(page) || page < 1) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			"page must be a positive integer",
		);
	}
	return page;
};

const parsePageSize = (raw: string | undefined) => {
	const pageSize = Number(raw ?? "10");
	if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			"pageSize must be an integer between 1 and 100",
		);
	}
	return pageSize;
};

const requireId = (c: Context) => {
	const id = c.req.param("id");
	if (!id) {
		throw new ApiError(400, ApiErrorCode.INVALID_PARAM, "Missing user id");
	}
	return id;
};

export const createAdminController = (service: AdminUserService) => ({
	list: async (c: Context) =>
		ok(
			c,
			await service.listUsers({
				page: parsePage(c.req.query("page")),
				pageSize: parsePageSize(c.req.query("pageSize")),
				search: c.req.query("search")?.trim() ?? "",
			}),
		),

	updateRole: async (c: Context<SessionEnv>) => {
		const body = await c.req.json<UpdateAdminUserRoleDto>();
		if (!ROLES.includes(body.role)) {
			throw new ApiError(
				400,
				ApiErrorCode.INVALID_PARAM,
				`role must be one of: ${ROLES.join(", ")}`,
			);
		}
		return ok(
			c,
			await service.updateRole(
				c.get("session").user.id,
				requireId(c),
				body.role,
			),
		);
	},

	ban: async (c: Context<SessionEnv>) => {
		const body = await c.req
			.json<BanAdminUserDto>()
			.catch(() => ({}) as BanAdminUserDto);
		return ok(
			c,
			await service.banUser(
				c.get("session").user.id,
				requireId(c),
				body.banReason,
			),
		);
	},

	unban: async (c: Context) => ok(c, await service.unbanUser(requireId(c))),
});

export type AdminController = ReturnType<typeof createAdminController>;
