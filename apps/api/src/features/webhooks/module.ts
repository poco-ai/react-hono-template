import type { FeatureModule } from "../../core/compose";
import type { FullFeatureContext } from "../../feature-context";
import { handleWebhookQueue } from "../../queue";
import { createWebhookDao } from "./dao/webhook.dao";
import { createWebhookDeliveryDao } from "./dao/webhook-delivery.dao";
import { createWebhooksRoutes } from "./routes/webhooks";
import { createWebhookService } from "./services/webhook.service";
import {
	createWebhookCleanupHandler,
	createWebhookDeliveryService,
} from "./services/webhook-delivery.service";

export type WebhooksDaos = {
	webhookDao: ReturnType<typeof createWebhookDao>;
	webhookDeliveryDao: ReturnType<typeof createWebhookDeliveryDao>;
};

/**
 * Webhooks: endpoint management plus delivery through the Cloudflare Queue
 * (or the Redis fallback loop when self-hosting). The delivery service
 * implements the issue/comment/relation event dispatcher port.
 */
export const webhooksModule = {
	id: "webhooks",
	platform: (env) => ({
		webhookQueue: env.WEBHOOK_QUEUE
			? {
					send: async (message) => {
						await env.WEBHOOK_QUEUE?.send(message);
					},
				}
			: null,
	}),
	createDaos: ({ db }) => ({
		webhookDao: createWebhookDao(db),
		webhookDeliveryDao: createWebhookDeliveryDao(db),
	}),
	register: (ctx) => {
		const webhookDeliveryService = createWebhookDeliveryService({
			webhookDao: ctx.daos.webhookDao,
			deliveryDao: ctx.daos.webhookDeliveryDao,
			queue: ctx.webhookQueue ?? null,
		});
		const webhookService = createWebhookService({
			webhookDao: ctx.daos.webhookDao,
			deliveryDao: ctx.daos.webhookDeliveryDao,
			plans: ctx.core.planService,
			deliveries: webhookDeliveryService,
			audit: ctx.core.auditService,
		});
		return {
			services: { webhookService, webhookDeliveryService },
			routes: [
				{
					phase: "org",
					create: () => createWebhooksRoutes(webhookService),
				},
			],
			cleanupHandlers: [
				createWebhookCleanupHandler(ctx.daos.webhookDeliveryDao),
			],
			queueConsumers: [
				{
					queue: "webhook",
					handle: (batch) =>
						handleWebhookQueue(
							batch as Parameters<typeof handleWebhookQueue>[0],
							webhookDeliveryService,
						),
				},
			],
		};
	},
} satisfies FeatureModule<WebhooksDaos, FullFeatureContext>;

export type WebhooksContribution = ReturnType<
	typeof webhooksModule.register
> & {
	daos: WebhooksDaos;
};
