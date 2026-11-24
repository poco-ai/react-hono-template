import { env } from "cloudflare:workers";
import { createApp } from "./app";
import { platformFromBindings } from "./core/platform/cloudflare";
import { FEATURE_MODULES } from "./manifest";
import { dispatchQueueConsumers } from "./queue";

const { app, queueConsumers, runScheduled } = createApp(
	platformFromBindings(env, FEATURE_MODULES),
);

export default {
	fetch: app.fetch,
	queue: (batch: MessageBatch<{ deliveryId: string }>) =>
		dispatchQueueConsumers(queueConsumers, batch),
	scheduled: (
		_controller: ScheduledController,
		_env: Env,
		ctx: ExecutionContext,
	) => runScheduled((task) => ctx.waitUntil(task())),
};
