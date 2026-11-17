import type { CacheGetOptions, CacheSetOptions, CacheStore } from "../kv/types";
import type { RedisLike } from "./client";

const MIN_TTL_SECONDS = 30;

export const createRedisCache = (redis: RedisLike): CacheStore => ({
	get: async <T>(key: string, _options?: CacheGetOptions) => {
		try {
			const raw = await redis.get(key);
			if (raw == null) return null;
			return JSON.parse(raw) as T;
		} catch (error) {
			console.warn("[redis] get failed", key, error);
			return null;
		}
	},

	set: async <T>(key: string, value: T, options?: CacheSetOptions) => {
		try {
			const payload = JSON.stringify(value);
			const ttl = options?.ttlSeconds;
			if (ttl === undefined) {
				await redis.set(key, payload);
			} else {
				await redis.set(key, payload, "EX", Math.max(ttl, MIN_TTL_SECONDS));
			}
			return true;
		} catch (error) {
			console.warn("[redis] set failed", key, error);
			return false;
		}
	},

	delete: async (key: string) => {
		try {
			await redis.del(key);
			return true;
		} catch (error) {
			console.warn("[redis] delete failed", key, error);
			return false;
		}
	},
});

/**
 * Process-local cache in front of Redis for keys that are read on every
 * request. Mirrors the Worker KV `cacheTtl` edge cache for runtime config.
 */
export const withMemoryL1 = (
	inner: CacheStore,
	options: { ttlMs: number; match: (key: string) => boolean },
): CacheStore => {
	const memory = new Map<string, { value: unknown; expiresAt: number }>();
	return {
		get: async <T>(key: string, getOptions?: CacheGetOptions) => {
			if (options.match(key)) {
				const hit = memory.get(key);
				if (hit && hit.expiresAt > Date.now()) return hit.value as T;
			}
			const value = await inner.get<T>(key, getOptions);
			if (options.match(key) && value != null) {
				memory.set(key, {
					value,
					expiresAt: Date.now() + options.ttlMs,
				});
			}
			return value;
		},
		set: async <T>(key: string, value: T, setOptions?: CacheSetOptions) => {
			if (options.match(key)) {
				memory.set(key, {
					value,
					expiresAt: Date.now() + options.ttlMs,
				});
			}
			return inner.set(key, value, setOptions);
		},
		delete: async (key: string) => {
			memory.delete(key);
			return inner.delete(key);
		},
	};
};
