import { createApp } from "./app";
import { detachBackground } from "./core/lib/background";
import type { WebhookDeliveryQueueTarget } from "./core/lib/ports/webhooks";
import { startScheduledLoop } from "./core/lib/redis/scheduler";
import { startWebhookLoop } from "./core/lib/redis/webhook-queue";
import { platformFromProcess } from "./core/platform/server";
import { FEATURE_MODULES } from "./manifest";

export const listen = async () => {
	const runtime = platformFromProcess(process.env, FEATURE_MODULES);
	const { app, dependencies, runScheduled } = createApp(runtime.platform);
	const webhookDelivery = (
		dependencies.services as {
			webhookDeliveryService?: WebhookDeliveryQueueTarget;
		}
	).webhookDeliveryService;
	const stopWebhook = webhookDelivery
		? startWebhookLoop(runtime.redis, webhookDelivery)
		: async () => {};
	const stopCron = startScheduledLoop(runtime.redis, () =>
		runScheduled(detachBackground),
	);
	const port = Number(process.env.PORT ?? 8787);
	const hostname = process.env.HOST ?? "0.0.0.0";
	const server = (
		globalThis as unknown as {
			Bun: {
				serve: (options: {
					port: number;
					hostname: string;
					fetch: typeof app.fetch;
				}) => { port: number; stop: () => void };
			};
		}
	).Bun.serve({
		port,
		hostname,
		fetch: app.fetch,
	});
	console.log(`[api] listening on http://${hostname}:${server.port}`);

	let stopping = false;
	const shutdown = async () => {
		if (stopping) return;
		stopping = true;
		const webhookDrained = stopWebhook();
		stopCron();
		server.stop();
		await webhookDrained;
		await runtime.close();
		process.exit(0);
	};
	process.on("SIGINT", () => {
		void shutdown();
	});
	process.on("SIGTERM", () => {
		void shutdown();
	});
};
