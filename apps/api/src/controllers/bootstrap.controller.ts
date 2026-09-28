import type { Context } from "hono";
import type { AdminUserDao } from "../dao/admin-user.dao";
import { ok } from "../lib/response";

export const createBootstrapController = (dao: AdminUserDao) => ({
	hasAdmin: async (c: Context) => ok(c, { hasAdmin: await dao.hasAdminUser() }),
});

export type BootstrapController = ReturnType<typeof createBootstrapController>;
