import { Hono } from "hono";
import { createBootstrapController } from "../controllers/bootstrap.controller";
import type { BootstrapService } from "../services/bootstrap.service";

export const createBootstrapRoutes = (service: BootstrapService) => {
	const bootstrapController = createBootstrapController(service);
	return new Hono().get("/api/bootstrap", (c) =>
		bootstrapController.hasAdmin(c),
	);
};
