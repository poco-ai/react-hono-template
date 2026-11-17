import { PLANS } from "@workspace/shared";
import type { AiRateLimiters } from "../../services/ai-usage.service";
import type { PlanRateLimiters, RateLimiter } from "../rate-limit";
import type { RedisLike } from "./client";

const WINDOW_MS = 60_000;

/** Fixed window counter. The limit lives in `PLANS`, not in a binding. */
export const createRedisRateLimiter = (
	redis: RedisLike,
	limit: number,
	namespace: string,
	windowMs = WINDOW_MS,
): RateLimiter => ({
	limit: async ({ key }) => {
		const bucket = `rl:${namespace}:${Math.floor(Date.now() / windowMs)}:${key}`;
		const count = await redis.incr(bucket);
		if (count === 1) {
			await redis.pexpire(bucket, windowMs);
		}
		return { success: count <= limit };
	},
});

export const createPlanRateLimiters = (
	redis: RedisLike,
): { api: PlanRateLimiters; ai: AiRateLimiters } => ({
	api: {
		free: createRedisRateLimiter(redis, PLANS.free.apiRateLimit, "api:free"),
		pro: createRedisRateLimiter(redis, PLANS.pro.apiRateLimit, "api:pro"),
	},
	ai: {
		free: createRedisRateLimiter(
			redis,
			PLANS.free.aiRequestsPerMinute,
			"ai:free",
		),
		pro: createRedisRateLimiter(redis, PLANS.pro.aiRequestsPerMinute, "ai:pro"),
	},
});
