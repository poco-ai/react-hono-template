import { ApiError, ApiErrorCode } from "@workspace/shared";
import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { authRelations } from "./db/auth-schema";
import { usersTable } from "./db/schema";
import { fail, ok } from "./lib/response";

export type Database = DrizzleD1Database<typeof authRelations>;

export const createRoutes = (db: Database) => {
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
		.get("/api/users", async (c) => {
			const rows = await db.select().from(usersTable).all();
			return ok(c, rows);
		})
		.get("/api/users/:id", async (c) => {
			const id = Number(c.req.param("id"));
			if (!Number.isInteger(id) || id < 1) {
				throw new ApiError(
					400,
					ApiErrorCode.INVALID_PARAM,
					"User id must be a positive integer",
				);
			}
			const row = await db
				.select()
				.from(usersTable)
				.where(eq(usersTable.id, id))
				.get();
			if (!row) {
				throw new ApiError(404, ApiErrorCode.NOT_FOUND, `User ${id} not found`);
			}
			return ok(c, row);
		});
};

export type AppType = ReturnType<typeof createRoutes>;
