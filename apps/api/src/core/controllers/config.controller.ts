import type { UpdateRuntimeConfigInput } from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { ConfigService } from "../services/config.service";

export const createConfigController = (service: ConfigService) => ({
	get: async (c: Context) => {
		c.header("Cache-Control", "public, max-age=60");
		return ok(c, await service.getConfig());
	},

	update: async (c: Context, input: UpdateRuntimeConfigInput) =>
		ok(c, await service.updateConfig(input)),
});
