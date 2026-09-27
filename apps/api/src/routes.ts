import { ApiError, ApiErrorCode } from "@workspace/shared";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createUserController } from "./controllers/user.controller";
import { createUserDao } from "./dao/user.dao";
import type { Database } from "./db/types";
import { fail, ok } from "./lib/response";
import { createUserService } from "./services/user.service";

export const createRoutes = (db: Database) => {
	const userDao = createUserDao(db);
	const userService = createUserService(userDao);
	const usersController = createUserController(userService);

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
		.get("/api/users", (c) => usersController.list(c))
		.get("/api/users/:id", (c) => usersController.getById(c));
};

export type AppType = ReturnType<typeof createRoutes>;
