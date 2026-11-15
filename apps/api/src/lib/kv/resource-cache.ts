import type { CacheStore } from "./types";

/**
 * Read-through cache for one kind of business resource: a best-effort
 * per-isolate L1 map in front of the KV `CacheStore`.
 *
 * - The L1 map is per isolate and invisible to other isolates, so entries are
 *   short-lived and every write/invalidate also updates KV. Never use this
 *   helper for auth/session or permission data: a stale L1 entry from another
 *   isolate's write cannot be evicted here, so only stable business payloads
 *   (config, plan, label lists) belong behind it.
 * - Keys must already be fully qualified cache keys; the helper adds no
 *   namespacing and never inspects the key itself.
 */
export type ResourceCache<T> = {
	/** L1 hit, else KV, else `load` (whose result is written back to L1 + KV). */
	get: (key: string) => Promise<T>;
	/**
	 * Writes KV and mirrors the value into L1. Returns `false` when the KV
	 * write failed so callers can decide whether that is fatal.
	 */
	set: (key: string, value: T) => Promise<boolean>;
	/** Drops the L1 entry and deletes the KV key. */
	invalidate: (key: string) => Promise<boolean>;
};

export type ResourceCacheOptions<T> = {
	cache: CacheStore;
	/** L1 lifetime in ms; `0` (default) disables the in-memory layer. */
	l1TtlMs?: number;
	/** KV expiration for writes; omitted means the KV default (no expiration). */
	ttlSeconds?: number;
	/** `cacheTtl` hint for KV reads; the store clamps it to at least 30s. */
	cacheTtlSeconds?: number;
	/** Returns `null` for anything that must be re-loaded from the source. */
	parse: (stored: unknown) => T | null;
	load: (key: string) => Promise<T>;
	/** Called when KV held a value that `parse` rejected. */
	onInvalidStored?: (key: string, stored: unknown) => void;
};

export const createResourceCache = <T>({
	cache,
	l1TtlMs = 0,
	ttlSeconds,
	cacheTtlSeconds,
	parse,
	load,
	onInvalidStored,
}: ResourceCacheOptions<T>): ResourceCache<T> => {
	const l1 = new Map<string, { value: T; expiresAt: number }>();

	const remember = (key: string, value: T) => {
		if (l1TtlMs > 0) {
			l1.set(key, { value, expiresAt: Date.now() + l1TtlMs });
		}
		return value;
	};

	// The store already logs and returns `false` on failure; read paths stay
	// best effort, only `set` surfaces the boolean to its caller.
	const writeThrough = (key: string, value: T) =>
		ttlSeconds === undefined
			? cache.set(key, value)
			: cache.set(key, value, { ttlSeconds });

	const get = async (key: string): Promise<T> => {
		const cached = l1.get(key);
		if (cached) {
			if (cached.expiresAt > Date.now()) {
				return cached.value;
			}
			l1.delete(key);
		}

		const stored =
			cacheTtlSeconds === undefined
				? await cache.get<unknown>(key)
				: await cache.get<unknown>(key, { cacheTtl: cacheTtlSeconds });
		const parsed = parse(stored);
		if (parsed !== null) {
			return remember(key, parsed);
		}
		if (stored !== null && stored !== undefined) {
			onInvalidStored?.(key, stored);
		}

		const loaded = await load(key);
		await writeThrough(key, loaded);
		return remember(key, loaded);
	};

	const set = async (key: string, value: T) => {
		const written = await writeThrough(key, value);
		if (written) {
			remember(key, value);
		}
		return written;
	};

	const invalidate = async (key: string) => {
		l1.delete(key);
		return cache.delete(key);
	};

	return { get, set, invalidate };
};
