import assert from "node:assert/strict";
import { test } from "node:test";
import { createKvCache } from "../src/lib/kv/cache";

type GetCall = { key: string; options?: { type?: string; cacheTtl?: number } };
type PutCall = {
	key: string;
	value: string;
	options?: { expirationTtl?: number };
};

const fakeKv = ({
	stored = null as string | null,
	getError = null as Error | null,
	putError = null as Error | null,
	deleteError = null as Error | null,
} = {}) => {
	const gets: GetCall[] = [];
	const puts: PutCall[] = [];
	const deletes: string[] = [];
	const kv = {
		get: async (key: string, options?: GetCall["options"]) => {
			gets.push({ key, options });
			if (getError) throw getError;
			if (stored === null) return null;
			return options?.type === "json" ? JSON.parse(stored) : stored;
		},
		put: async (key: string, value: string, options?: PutCall["options"]) => {
			puts.push({ key, value, options });
			if (putError) throw putError;
		},
		delete: async (key: string) => {
			deletes.push(key);
			if (deleteError) throw deleteError;
		},
	} as unknown as KVNamespace;
	return { kv, gets, puts, deletes };
};

test("get parses JSON and defaults cacheTtl to 60", async () => {
	const { kv, gets } = fakeKv({ stored: '{"hello":"world"}' });
	assert.deepEqual(await createKvCache(kv).get("key"), { hello: "world" });
	assert.equal(gets[0]?.key, "key");
	assert.equal(gets[0]?.options?.type, "json");
	assert.equal(gets[0]?.options?.cacheTtl, 60);
});

test("get clamps cacheTtl below 30", async () => {
	const { kv, gets } = fakeKv({ stored: "null" });
	await createKvCache(kv).get("key", { cacheTtl: 5 });
	assert.equal(gets[0]?.options?.cacheTtl, 30);
});

test("get returns null when the namespace throws", async () => {
	const { kv } = fakeKv({ getError: new Error("kv down") });
	assert.equal(await createKvCache(kv).get("key"), null);
});

test("set clamps ttlSeconds to 30 and returns true", async () => {
	const { kv, puts } = fakeKv();
	const result = await createKvCache(kv).set(
		"key",
		{ a: 1 },
		{ ttlSeconds: 5 },
	);
	assert.equal(result, true);
	assert.equal(puts[0]?.value, '{"a":1}');
	assert.deepEqual(puts[0]?.options, { expirationTtl: 30 });
});

test("set without ttlSeconds omits expirationTtl", async () => {
	const { kv, puts } = fakeKv();
	assert.equal(await createKvCache(kv).set("key", 1), true);
	assert.equal(puts[0]?.options?.expirationTtl, undefined);
});

test("set returns false when put throws", async () => {
	const { kv } = fakeKv({ putError: new Error("kv down") });
	assert.equal(await createKvCache(kv).set("key", 1), false);
});

test("delete returns true and reports failures as false", async () => {
	const ok = fakeKv();
	assert.equal(await createKvCache(ok.kv).delete("key"), true);
	assert.deepEqual(ok.deletes, ["key"]);

	const failing = fakeKv({ deleteError: new Error("kv down") });
	assert.equal(await createKvCache(failing.kv).delete("key"), false);
});
