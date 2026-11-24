import { drizzle } from "drizzle-orm/d1";
import { authRelations } from "../../db/auth-schema";
import type { WebhookJobQueue } from "../../features/webhooks/services/webhook-delivery.service";
import { createKvCache } from "../lib/kv/cache";
import { sharedPlatformConfig } from "./shared";
import type { AppPlatform } from "./types";

/** Worker bindings → platform. This is the only Cloudflare-shaped adapter. */
export const platformFromBindings = (env: Env): AppPlatform => {
	const db = drizzle(env.DB, { relations: authRelations });
	const webhookQueue: WebhookJobQueue | null = env.WEBHOOK_QUEUE
		? {
				send: async (message) => {
					await env.WEBHOOK_QUEUE.send(message);
				},
			}
		: null;

	return {
		dialect: "sqlite",
		db,
		cache: createKvCache(env.KV),
		webhookQueue,
		aiRateLimiters: {
			free: env.RATE_LIMITER_AI_FREE,
			pro: env.RATE_LIMITER_AI_PRO,
		},
		apiRateLimiters: {
			free: env.RATE_LIMITER_FREE,
			pro: env.RATE_LIMITER_PRO,
		},
		authSecret: env.BETTER_AUTH_SECRET,
		...sharedPlatformConfig(env),
	};
};
