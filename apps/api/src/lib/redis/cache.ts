import { createJsonCache } from "../kv/json-cache";
import type { CacheStore } from "../kv/types";
import type { RedisLike } from "./client";

export const createRedisCache = (redis: RedisLike): CacheStore =>
	createJsonCache({
		label: "redis",
		read: (key) => redis.get(key),
		write: async (key, json, ttlSeconds) => {
			if (ttlSeconds === undefined) {
				await redis.set(key, json);
				return;
			}
			await redis.set(key, json, "EX", ttlSeconds);
		},
		remove: async (key) => {
			await redis.del(key);
		},
	});
