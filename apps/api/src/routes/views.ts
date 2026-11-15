import {
	createViewSchema,
	updateViewSchema,
	viewListQuerySchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { createViewController } from "../controllers/view.controller";
import { viewParams } from "../lib/params";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { ViewService } from "../services/view.service";

/**
 * Saved views. Reads cover the caller's own views plus every shared view;
 * write permissions (owner, shared-view owner/admin, sharing) are enforced in
 * the service so the capability layer reuses the same rules.
 */
export const createViewsRoutes = (service: ViewService) => {
	const controller = createViewController(service);
	return (
		new Hono<SessionEnv & OrgEnv>()
			.get(
				"/api/orgs/:orgId/views",
				validate(viewListQuerySchema, "query"),
				(c) => controller.list(c, c.req.valid("query")),
			)
			.post("/api/orgs/:orgId/views", validate(createViewSchema, "json"), (c) =>
				controller.create(c, c.req.valid("json")),
			)
			.put(
				"/api/orgs/:orgId/views/:viewId/default",
				validate(viewParams, "param"),
				(c) => controller.setDefault(c, true),
			)
			// Registered before the generic delete so `default` is not read as a view id.
			.delete(
				"/api/orgs/:orgId/views/:viewId/default",
				validate(viewParams, "param"),
				(c) => controller.clearDefault(c),
			)
			.patch(
				"/api/orgs/:orgId/views/:viewId",
				validate(viewParams, "param"),
				validate(updateViewSchema, "json"),
				(c) => controller.update(c, c.req.valid("json")),
			)
			.delete(
				"/api/orgs/:orgId/views/:viewId",
				validate(viewParams, "param"),
				(c) => controller.remove(c),
			)
	);
};
