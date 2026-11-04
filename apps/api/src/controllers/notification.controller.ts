import type { NotificationListQuery } from "@workspace/shared";
import type { Context } from "hono";
import { requireParam } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { NotificationService } from "../services/notification.service";

type Env = SessionEnv & OrgEnv;

export const createNotificationController = (service: NotificationService) => ({
	list: async (c: Context<Env>, query: NotificationListQuery) =>
		ok(
			c,
			await service.listInbox(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				query,
			),
		),

	unreadCount: async (c: Context<Env>) =>
		ok(c, {
			unread: await service.unreadCount(
				c.get("orgMember").orgId,
				c.get("session").user.id,
			),
		}),

	read: async (c: Context<Env>) =>
		ok(
			c,
			await service.markRead(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				requireParam(c, "notificationId"),
			),
		),

	readAll: async (c: Context<Env>) =>
		ok(
			c,
			await service.markAllRead(
				c.get("orgMember").orgId,
				c.get("session").user.id,
			),
		),

	remove: async (c: Context<Env>) => {
		await service.delete(
			c.get("orgMember").orgId,
			c.get("session").user.id,
			requireParam(c, "notificationId"),
		);
		return ok(c, { deleted: true });
	},
});
