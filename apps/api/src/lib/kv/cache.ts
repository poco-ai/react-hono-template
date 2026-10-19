import type { CacheGetOptions, CacheSetOptions, CacheStore } from "./types";

export type { CacheGetOptions, CacheSetOptions, CacheStore } from "./types";

const DEFAULT_CACHE_TTL = 60;
const MIN_TTL = 30;

export const createKvCache = (kv: KVNamespace): CacheStore => ({
	get: async <T>(key: string, options?: CacheGetOptions) => {
		try {
			const cacheTtl = Math.max(
				options?.cacheTtl ?? DEFAULT_CACHE_TTL,
				MIN_TTL,
			);
			return (await kv.get<T>(key, { type: "json", cacheTtl })) ?? null;
		} catch (error) {
			console.warn("[kv] get failed", key, error);
			return null;
		}
	},

	set: async <T>(key: string, value: T, options?: CacheSetOptions) => {
		try {
			const ttl = options?.ttlSeconds;
			await kv.put(
				key,
				JSON.stringify(value),
				ttl === undefined
					? undefined
					: { expirationTtl: Math.max(ttl, MIN_TTL) },
			);
			return true;
		} catch (error) {
			console.warn("[kv] set failed", key, error);
			return false;
		}
	},

	delete: async (key: string) => {
		try {
			await kv.delete(key);
			return true;
		} catch (error) {
			console.warn("[kv] delete failed", key, error);
			return false;
		}
	},
});
