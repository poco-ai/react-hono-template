import { ApiError, ApiErrorCode } from "@workspace/shared";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { validator } from "hono/validator";
import { createAdminController } from "./controllers/admin-user.controller";
import { createUserController } from "./controllers/user.controller";
import { createAdminUserDao } from "./dao/admin-user.dao";
import { createUserDao } from "./dao/user.dao";
import type { Database } from "./db/types";
import type {
	BanAdminUserDto,
	UpdateAdminUserRoleDto,
} from "./dto/admin-user.dto";
import type { Auth } from "./lib/auth";
import { fail, ok } from "./lib/response";
import { requireAuth, requirePermission } from "./middleware/auth";
import { createAdminUserService } from "./services/admin-user.service";
import { createUserService } from "./services/user.service";

export const createRoutes = ({ db, auth }: { db: Database; auth: Auth }) => {
	const userDao = createUserDao(db);
	const userService = createUserService(userDao);
	const usersController = createUserController(userService);

	const adminUserDao = createAdminUserDao(db);
	const adminUserService = createAdminUserService(adminUserDao);
	const adminController = createAdminController(adminUserService);

	return new Hono()
		.onError((err, c) => {
			if (err instanceof ApiError) {
				return fail(
					c,
					err.code,
					err.message,
					err.status as ContentfulStatusCode,
				);
			}
			console.error("[api] Unhandled error:", err);
			return fail(c, ApiErrorCode.INTERNAL_ERROR, "Internal Server Error", 500);
		})
		.get("/api/hello", (c) => ok(c, { message: "Hello from Workers API!" }))
		.use("/api/users/*", requireAuth(auth))
		.get("/api/users", (c) => usersController.list(c))
		.get("/api/users/:id", (c) => usersController.getById(c))
		.use("/api/admin/*", requireAuth(auth))
		.get("/api/admin/users", requirePermission({ user: ["list"] }), (c) =>
			adminController.list(c),
		)
		.patch(
			"/api/admin/users/:id/role",
			requirePermission({ user: ["set-role"] }),
			validator("json", (value) => value as UpdateAdminUserRoleDto),
			(c) => adminController.updateRole(c),
		)
		.post(
			"/api/admin/users/:id/ban",
			requirePermission({ user: ["ban"] }),
			validator("json", (value) => value as BanAdminUserDto),
			(c) => adminController.ban(c),
		)
		.delete(
			"/api/admin/users/:id/ban",
			requirePermission({ user: ["ban"] }),
			(c) => adminController.unban(c),
		);
};

export type AppType = ReturnType<typeof createRoutes>;
