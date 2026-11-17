import { env } from "cloudflare:workers";
import { createApp } from "./app";
import { platformFromBindings } from "./platform/cloudflare";
import { handleWebhookQueue } from "./queue";

const { app, dependencies, runScheduled } = createApp(
	platformFromBindings(env),
);

export default {
	fetch: app.fetch,
	queue: (batch: MessageBatch<{ deliveryId: string }>) =>
		handleWebhookQueue(batch, dependencies.services.webhookDeliveryService),
	scheduled: (
		_controller: ScheduledController,
		_env: Env,
		ctx: ExecutionContext,
	) => runScheduled((task) => ctx.waitUntil(task())),
};
