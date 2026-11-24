import {
	createWebhookSchema,
	updateWebhookSchema,
	webhookDeliveryListQuerySchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { webhookDeliveryParams, webhookParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { requireOrgRole } from "../../../core/middleware/org";
import { createWebhookController } from "../controllers/webhook.controller";
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
			validate(webhookParams, "param"),
			validate(updateWebhookSchema, "json"),
			(c) => webhookController.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/webhooks/:webhookId",
			requireOrgRole("owner", "admin"),
			validate(webhookParams, "param"),
			(c) => webhookController.remove(c),
		)
		.get(
			"/api/orgs/:orgId/webhooks/:webhookId/deliveries",
			requireOrgRole("owner", "admin"),
			validate(webhookParams, "param"),
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
			validate(webhookParams, "param"),
			(c) => webhookController.ping(c),
		)
		.post(
			"/api/orgs/:orgId/webhook-deliveries/:deliveryId/redeliver",
			requireOrgRole("owner", "admin"),
			validate(webhookDeliveryParams, "param"),
			(c) => webhookController.redeliver(c),
		);
};
