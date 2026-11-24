import type { CacheGetOptions, CacheSetOptions, CacheStore } from "./types";

const DEFAULT_CACHE_TTL_SECONDS = 60;
const MIN_TTL_SECONDS = 30;

/** One TTL policy for KV's edge cache and Redis `EX`. Values below 30s are raised. */
export const clampCacheTtl = (
	seconds: number | undefined,
	fallback = DEFAULT_CACHE_TTL_SECONDS,
) => Math.max(seconds ?? fallback, MIN_TTL_SECONDS);

export type JsonCacheIo = {
	label: string;
	read: (key: string, cacheTtlSeconds: number) => Promise<unknown>;
	write: (key: string, json: string, ttlSeconds?: number) => Promise<void>;
	remove: (key: string) => Promise<void>;
};

const parseStored = <T>(raw: unknown): T | null => {
	if (raw == null) return null;
	if (typeof raw === "string") return JSON.parse(raw) as T;
	return raw as T;
};

/**
 * JSON get/set/delete shared by KV and Redis. The backend only moves bytes;
 * parsing, the 30s minimum TTL and best-effort failures live here.
 */
export const createJsonCache = (io: JsonCacheIo): CacheStore => ({
	get: async <T>(key: string, options?: CacheGetOptions) => {
		try {
			const raw = await io.read(key, clampCacheTtl(options?.cacheTtl));
			return parseStored<T>(raw);
		} catch (error) {
			console.warn(`[${io.label}] get failed`, key, error);
			return null;
		}
	},

	set: async <T>(key: string, value: T, options?: CacheSetOptions) => {
		try {
			const ttl = options?.ttlSeconds;
			await io.write(
				key,
				JSON.stringify(value),
				ttl === undefined ? undefined : clampCacheTtl(ttl, ttl),
			);
			return true;
		} catch (error) {
			console.warn(`[${io.label}] set failed`, key, error);
			return false;
		}
	},

	delete: async (key: string) => {
		try {
			await io.remove(key);
			return true;
		} catch (error) {
			console.warn(`[${io.label}] delete failed`, key, error);
			return false;
		}
	},
});
