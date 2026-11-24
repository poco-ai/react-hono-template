import {
	createStatusSchema,
	deleteStatusQuerySchema,
	reorderStatusesSchema,
	updateStatusSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { statusParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { requireOrgRole } from "../../../core/middleware/org";
import { createStatusController } from "../controllers/status.controller";
import type { StatusService } from "../services/status.service";

export const createStatusesRoutes = (service: StatusService) => {
	const controller = createStatusController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get("/api/orgs/:orgId/statuses", (c) => controller.list(c))
		.post(
			"/api/orgs/:orgId/statuses",
			requireOrgRole("owner", "admin"),
			validate(createStatusSchema, "json"),
			(c) => controller.create(c, c.req.valid("json")),
		)
		.put(
			"/api/orgs/:orgId/statuses/reorder",
			requireOrgRole("owner", "admin"),
			validate(reorderStatusesSchema, "json"),
			(c) => controller.reorder(c, c.req.valid("json")),
		)
		.patch(
			"/api/orgs/:orgId/statuses/:statusId",
			requireOrgRole("owner", "admin"),
			validate(statusParams, "param"),
			validate(updateStatusSchema, "json"),
			(c) => controller.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/statuses/:statusId",
			requireOrgRole("owner", "admin"),
			validate(statusParams, "param"),
			validate(deleteStatusQuerySchema, "query"),
			(c) => controller.remove(c, c.req.valid("query")),
		);
};
