import { Hono } from "hono";
import { createConfigController } from "../controllers/config.controller";
import type { ConfigService } from "../services/config.service";

export const createConfigRoutes = (service: ConfigService) => {
	const configController = createConfigController(service);
	return new Hono().get("/api/config", (c) => configController.get(c));
};
