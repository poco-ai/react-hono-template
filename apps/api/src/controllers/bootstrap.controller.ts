import type { Context } from "hono";
import { ok } from "../lib/response";
import type { BootstrapService } from "../services/bootstrap.service";

export const createBootstrapController = (service: BootstrapService) => ({
	hasAdmin: async (c: Context) => ok(c, await service.getBootstrap()),
});

export type BootstrapController = ReturnType<typeof createBootstrapController>;
