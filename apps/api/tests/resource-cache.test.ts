import assert from "node:assert/strict";
import { test } from "node:test";
import { createResourceCache } from "../src/core/lib/kv/resource-cache";
import type {
	CacheGetOptions,
	CacheSetOptions,
	CacheStore,
} from "../src/core/lib/kv/types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createFakeCache = ({
	initial = {} as Record<string, unknown>,
	setResult = true,
	getError = false,
} = {}) => {
	const entries = new Map<string, unknown>(Object.entries(initial));
	const calls = {
		gets: [] as { key: string; cacheTtl?: number }[],
		sets: [] as { key: string; value: unknown; ttlSeconds?: number }[],
		deletes: [] as string[],
	};
	const store: CacheStore = {
		get: async <T>(key: string, options?: CacheGetOptions) => {
			calls.gets.push({ key, cacheTtl: options?.cacheTtl });
			if (getError) return null;
			return (entries.get(key) as T | undefined) ?? null;
		},
		set: async <T>(key: string, value: T, options?: CacheSetOptions) => {
			calls.sets.push({ key, value, ttlSeconds: options?.ttlSeconds });
			if (!setResult) return false;
			entries.set(key, value);
			return true;
		},
		delete: async (key: string) => {
			calls.deletes.push(key);
			return entries.delete(key);
		},
	};
	return { store, calls, entries };
};

const parseName = (stored: unknown): string | null =>
	typeof stored === "string" ? stored : null;

test("an L1 hit is served without touching KV", async () => {
	const { store, calls } = createFakeCache({ initial: { key: "stored" } });
	let loads = 0;
	const cache = createResourceCache<string>({
		cache: store,
		l1TtlMs: 60_000,
		parse: parseName,
		load: async () => {
			loads += 1;
			return "loaded";
		},
	});

	assert.equal(await cache.get("key"), "stored");
	assert.equal(await cache.get("key"), "stored");
	assert.equal(calls.gets.length, 1);
	assert.equal(loads, 0);
});

test("an expired L1 entry falls back to KV", async () => {
	const { store, calls } = createFakeCache({ initial: { key: "stored" } });
	const cache = createResourceCache<string>({
		cache: store,
		l1TtlMs: 10,
		parse: parseName,
		load: async () => "loaded",
	});

	assert.equal(await cache.get("key"), "stored");
	await sleep(25);
	assert.equal(await cache.get("key"), "stored");
	assert.equal(calls.gets.length, 2);
});

test("parse failures load from the source and write back to L1 and KV", async () => {
	const { store, calls } = createFakeCache({ initial: { key: 42 } });
	let loads = 0;
	const cache = createResourceCache<string>({
		cache: store,
		l1TtlMs: 60_000,
		ttlSeconds: 3600,
		cacheTtlSeconds: 30,
		parse: parseName,
		load: async () => {
			loads += 1;
			return "loaded";
		},
	});

	assert.equal(await cache.get("key"), "loaded");
	assert.equal(loads, 1);
	assert.deepEqual(calls.gets, [{ key: "key", cacheTtl: 30 }]);
	assert.deepEqual(calls.sets, [
		{ key: "key", value: "loaded", ttlSeconds: 3600 },
	]);

	// The loaded value is now an L1 hit.
	assert.equal(await cache.get("key"), "loaded");
	assert.equal(calls.gets.length, 1);
	assert.equal(loads, 1);
});

test("onInvalidStored only fires for rejected payloads, not misses", async () => {
	const { store } = createFakeCache({ initial: { key: 42 } });
	const warned: { key: string; stored: unknown }[] = [];
	const cache = createResourceCache<string>({
		cache: store,
		parse: parseName,
		load: async () => "loaded",
		onInvalidStored: (key, stored) => warned.push({ key, stored }),
	});

	await cache.get("key");
	assert.deepEqual(warned, [{ key: "key", stored: 42 }]);

	await cache.get("missing");
	assert.equal(warned.length, 1);
});

test("a failed KV write on the read path still returns the loaded value", async () => {
	const { store, calls } = createFakeCache({ setResult: false });
	const cache = createResourceCache<string>({
		cache: store,
		l1TtlMs: 60_000,
		parse: parseName,
		load: async () => "loaded",
	});

	assert.equal(await cache.get("key"), "loaded");
	assert.equal(calls.sets.length, 1);
	// The value was still memoized in L1 so the miss is not repeated per call.
	assert.equal(await cache.get("key"), "loaded");
	assert.equal(calls.gets.length, 1);
});

test("a failed KV read falls back to the loader", async () => {
	const { store, calls } = createFakeCache({ getError: true });
	const cache = createResourceCache<string>({
		cache: store,
		l1TtlMs: 60_000,
		parse: parseName,
		load: async () => "loaded",
	});

	assert.equal(await cache.get("key"), "loaded");
	assert.equal(calls.gets.length, 1);
	assert.equal(await cache.get("key"), "loaded");
	assert.equal(calls.gets.length, 1);
});

test("set returns false on write failure and leaves L1 empty", async () => {
	const { store, calls } = createFakeCache({ setResult: false });
	const cache = createResourceCache<string>({
		cache: store,
		l1TtlMs: 60_000,
		parse: parseName,
		load: async () => "loaded",
	});

	assert.equal(await cache.set("key", "written"), false);
	assert.deepEqual(calls.sets, [
		{ key: "key", value: "written", ttlSeconds: undefined },
	]);
	assert.equal(await cache.get("key"), "loaded");
	assert.equal(calls.gets.length, 1);
});

test("set writes through and refreshes L1", async () => {
	const { store, calls, entries } = createFakeCache();
	const cache = createResourceCache<string>({
		cache: store,
		l1TtlMs: 60_000,
		ttlSeconds: 3600,
		parse: parseName,
		load: async () => "loaded",
	});

	assert.equal(await cache.set("key", "written"), true);
	assert.equal(entries.get("key"), "written");
	assert.deepEqual(calls.sets, [
		{ key: "key", value: "written", ttlSeconds: 3600 },
	]);
	assert.equal(await cache.get("key"), "written");
	assert.equal(calls.gets.length, 0);
});

test("invalidate clears L1 and deletes the KV key", async () => {
	const { store, calls, entries } = createFakeCache({
		initial: { key: "old" },
	});
	const cache = createResourceCache<string>({
		cache: store,
		l1TtlMs: 60_000,
		parse: parseName,
		load: async () => "loaded",
	});

	assert.equal(await cache.get("key"), "old");
	assert.equal(await cache.invalidate("key"), true);
	assert.deepEqual(calls.deletes, ["key"]);
	assert.equal(entries.has("key"), false);

	assert.equal(await cache.get("key"), "loaded");
	assert.equal(calls.gets.length, 2);
});

test("l1TtlMs 0 keeps the cache stateless", async () => {
	const { store, calls } = createFakeCache({ initial: { key: "stored" } });
	const cache = createResourceCache<string>({
		cache: store,
		parse: parseName,
		load: async () => "loaded",
	});

	assert.equal(await cache.get("key"), "stored");
	assert.equal(await cache.get("key"), "stored");
	assert.equal(calls.gets.length, 2);
});

test("L1 entries are scoped per key", async () => {
	const { store, calls } = createFakeCache({
		initial: { a: "A", b: "B" },
	});
	const cache = createResourceCache<string>({
		cache: store,
		l1TtlMs: 60_000,
		parse: parseName,
		load: async () => "loaded",
	});

	assert.equal(await cache.get("a"), "A");
	assert.equal(await cache.get("b"), "B");
	assert.equal(await cache.get("a"), "A");
	assert.equal(calls.gets.length, 2);
});
