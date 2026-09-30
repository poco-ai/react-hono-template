import {
	createWebhookSchema,
	updateWebhookSchema,
	webhookDeliveryListQuerySchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { createWebhookController } from "../controllers/webhook.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import { requireOrgRole } from "../middleware/org";
import type { WebhookService } from "../services/webhook.service";

export const createWebhooksRoutes = (service: WebhookService) => {
	const webhookController = createWebhookController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get("/api/orgs/:orgId/webhooks", requireOrgRole("owner", "admin"), (c) =>
			webhookController.list(c),
		)
		.post(
			"/api/orgs/:orgId/webhooks",
			requireOrgRole("owner", "admin"),
			validate(createWebhookSchema, "json"),
			(c) => webhookController.create(c, c.req.valid("json")),
		)
		.patch(
			"/api/orgs/:orgId/webhooks/:webhookId",
			requireOrgRole("owner", "admin"),
			validate(updateWebhookSchema, "json"),
			(c) => webhookController.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/webhooks/:webhookId",
			requireOrgRole("owner", "admin"),
			(c) => webhookController.remove(c),
		)
		.get(
			"/api/orgs/:orgId/webhooks/:webhookId/deliveries",
			requireOrgRole("owner", "admin"),
			validate(webhookDeliveryListQuerySchema, "query"),
			(c) => webhookController.listDeliveries(c, c.req.valid("query")),
		)
		.get(
			"/api/orgs/:orgId/webhook-deliveries",
			requireOrgRole("owner", "admin"),
			validate(webhookDeliveryListQuerySchema, "query"),
			(c) => webhookController.listOrgDeliveries(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/webhooks/:webhookId/ping",
			requireOrgRole("owner", "admin"),
			(c) => webhookController.ping(c),
		)
		.post(
			"/api/orgs/:orgId/webhook-deliveries/:deliveryId/redeliver",
			requireOrgRole("owner", "admin"),
			(c) => webhookController.redeliver(c),
		);
};
