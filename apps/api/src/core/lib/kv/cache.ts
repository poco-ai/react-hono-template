import { createJsonCache } from "./json-cache";
import type { CacheStore } from "./types";

export type { CacheGetOptions, CacheSetOptions, CacheStore } from "./types";

export const createKvCache = (kv: KVNamespace): CacheStore =>
	createJsonCache({
		label: "kv",
		read: (key, cacheTtl) => kv.get(key, { type: "json", cacheTtl }),
		write: (key, json, ttlSeconds) =>
			kv.put(
				key,
				json,
				ttlSeconds === undefined ? undefined : { expirationTtl: ttlSeconds },
			),
		remove: (key) => kv.delete(key),
	});
