import { resolveServerDialect } from "../../db/dialect";
import { openPostgresDatabase } from "../../db/postgres";
import type { PlatformEnv } from "../lib/ports/platform";
import { createRedisCache } from "../lib/redis/cache";
import { createRedisClient, type RedisLike } from "../lib/redis/client";
import { createPlanRateLimiters } from "../lib/redis/rate-limit";
import { createRedisWebhookQueue } from "../lib/redis/webhook-queue";
import {
	featurePlatform,
	type PlatformContributor,
	sharedPlatformConfig,
} from "./shared";
import type { AppPlatform } from "./types";

const required = (env: NodeJS.ProcessEnv, name: string) => {
	const value = env[name]?.trim();
	if (!value) {
		throw new Error(`${name} is required to start the Bun server`);
	}
	return value;
};

export type ServerRuntime = {
	platform: AppPlatform;
	redis: RedisLike;
	close: () => Promise<void>;
};

/** Process environment → platform. Call only after `setSqlDialect("postgres")`. */
export const platformFromProcess = (
	env: NodeJS.ProcessEnv,
	modules: readonly PlatformContributor[] = [],
): ServerRuntime => {
	resolveServerDialect(env.SQL_DIALECT);
	const database = openPostgresDatabase(required(env, "DATABASE_URL"));
	const redis = createRedisClient(required(env, "REDIS_URL"));
	const limiters = createPlanRateLimiters(redis);
	const platformEnv = env as unknown as PlatformEnv;
	return {
		redis,
		platform: {
			dialect: "postgres",
			db: database.db,
			cache: createRedisCache(redis),
			...featurePlatform(platformEnv, modules),
			// Self-host delivery always goes through the Redis queue loop; it is
			// inert when the webhooks feature is trimmed.
			webhookQueue: createRedisWebhookQueue(redis),
			aiRateLimiters: limiters.ai,
			apiRateLimiters: limiters.api,
			authSecret: required(env, "BETTER_AUTH_SECRET"),
			...sharedPlatformConfig(platformEnv),
		},
		close: async () => {
			await redis.quit();
			await database.close();
		},
	};
};
