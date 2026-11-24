import {
	createRecurrenceSchema,
	updateRecurrenceSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { projectParams, recurrenceParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { createRecurrenceController } from "../controllers/recurrence.controller";
import type { RecurrenceService } from "../services/recurrence.service";

/**
 * Recurring issues live under a project. Every member may write; the shared
 * org middleware already blocks writes for frozen organizations.
 */
export const createRecurrencesRoutes = (service: RecurrenceService) => {
	const controller = createRecurrenceController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/projects/:projectId/recurrences",
			validate(projectParams, "param"),
			(c) => controller.list(c),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/recurrences",
			validate(projectParams, "param"),
			validate(createRecurrenceSchema, "json"),
			(c) => controller.create(c, c.req.valid("json")),
		)
		.patch(
			"/api/orgs/:orgId/projects/:projectId/recurrences/:recurrenceId",
			validate(recurrenceParams, "param"),
			validate(updateRecurrenceSchema, "json"),
			(c) => controller.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/recurrences/:recurrenceId",
			validate(recurrenceParams, "param"),
			(c) => controller.remove(c),
		);
};
