import { ApiError, ApiErrorCode } from "@workspace/shared";
import { createMiddleware } from "hono/factory";
import { hasPermission, type Permission } from "../lib/access";
import type { Auth, SessionData } from "../lib/auth";

export type SessionEnv = {
	Variables: {
		session: SessionData;
	};
};

export const requireAuth = (auth: Auth) =>
	createMiddleware<SessionEnv>(async (c, next) => {
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});
		if (!session) {
			throw new ApiError(
				401,
				ApiErrorCode.UNAUTHORIZED,
				"Authentication required",
			);
		}
		c.set("session", session);
		await next();
	});

export const requirePermission = (permission: Permission) =>
	createMiddleware<SessionEnv>(async (c, next) => {
		const session = c.get("session");
		const role = session?.user.role;
		if (!role || !hasPermission(role, permission)) {
			throw new ApiError(
				403,
				ApiErrorCode.FORBIDDEN,
				"You do not have permission to perform this action",
			);
		}
		await next();
	});
