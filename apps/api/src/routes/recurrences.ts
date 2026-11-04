import {
	createRecurrenceSchema,
	updateRecurrenceSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { createRecurrenceController } from "../controllers/recurrence.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { RecurrenceService } from "../services/recurrence.service";

/**
 * Recurring issues live under a project. Every member may write; the shared
 * org middleware already blocks writes for frozen organizations.
 */
export const createRecurrencesRoutes = (service: RecurrenceService) => {
	const controller = createRecurrenceController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get("/api/orgs/:orgId/projects/:projectId/recurrences", (c) =>
			controller.list(c),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/recurrences",
			validate(createRecurrenceSchema, "json"),
			(c) => controller.create(c, c.req.valid("json")),
		)
		.patch(
			"/api/orgs/:orgId/projects/:projectId/recurrences/:recurrenceId",
			validate(updateRecurrenceSchema, "json"),
			(c) => controller.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/recurrences/:recurrenceId",
			(c) => controller.remove(c),
		);
};
