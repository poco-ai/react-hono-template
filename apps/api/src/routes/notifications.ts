import { notificationListQuerySchema } from "@workspace/shared";
import { Hono } from "hono";
import { createNotificationController } from "../controllers/notification.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { NotificationService } from "../services/notification.service";

export const createNotificationsRoutes = (service: NotificationService) => {
	const controller = createNotificationController(service);
	return (
		new Hono<SessionEnv & OrgEnv>()
			.get(
				"/api/orgs/:orgId/notifications",
				validate(notificationListQuerySchema, "query"),
				(c) => controller.list(c, c.req.valid("query")),
			)
			// Static suffixes are registered before the dynamic id route.
			.get("/api/orgs/:orgId/notifications/unread-count", (c) =>
				controller.unreadCount(c),
			)
			.post("/api/orgs/:orgId/notifications/read-all", (c) =>
				controller.readAll(c),
			)
			.post("/api/orgs/:orgId/notifications/:notificationId/read", (c) =>
				controller.read(c),
			)
			.delete("/api/orgs/:orgId/notifications/:notificationId", (c) =>
				controller.remove(c),
			)
	);
};
