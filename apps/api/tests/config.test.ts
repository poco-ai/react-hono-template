import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	DEFAULT_RUNTIME_CONFIG,
	type RuntimeConfig,
} from "@workspace/shared";
import type { CacheStore } from "../src/lib/kv/types";
import {
	CONFIG_KEY,
	createConfigService,
} from "../src/services/config.service";

const cacheFor = ({ stored = null as unknown, setSucceeds = true } = {}) => {
	const gets: string[] = [];
	const sets: { key: string; value: unknown }[] = [];
	const cache: CacheStore = {
		get: async <T>(key: string) => {
			gets.push(key);
			return stored as T | null;
		},
		set: async <T>(key: string, value: T) => {
			sets.push({ key, value });
			return setSucceeds;
		},
		delete: async () => true,
	};
	return { cache, gets, sets };
};

test("getConfig returns defaults on a cache miss", async () => {
	const { cache, gets } = cacheFor();
	assert.deepEqual(
		await createConfigService(cache).getConfig(),
		DEFAULT_RUNTIME_CONFIG,
	);
	assert.deepEqual(gets, [CONFIG_KEY]);
});

test("getConfig returns a valid stored config", async () => {
	const stored: RuntimeConfig = {
		version: 1,
		maintenance: true,
		announcement: "Maintenance tonight",
		features: { beta: true },
	};
	const { cache } = cacheFor({ stored });
	assert.deepEqual(await createConfigService(cache).getConfig(), stored);
});

test("getConfig falls back to defaults for malformed payloads", async () => {
	const { cache } = cacheFor({
		stored: { version: 2, maintenance: "yes" },
	});
	assert.deepEqual(
		await createConfigService(cache).getConfig(),
		DEFAULT_RUNTIME_CONFIG,
	);
});

test("getConfig returns a fresh default rather than the shared constant", async () => {
	const config = await createConfigService(cacheFor().cache).getConfig();
	config.features.mutated = true;
	assert.equal(DEFAULT_RUNTIME_CONFIG.features.mutated, undefined);
});

test("L1 cache prevents a second KV read", async () => {
	const { cache, gets } = cacheFor();
	const service = createConfigService(cache);
	await service.getConfig();
	await service.getConfig();
	assert.equal(gets.length, 1);
});

test("updateConfig writes KV, returns the config and refreshes L1", async () => {
	const { cache, gets, sets } = cacheFor();
	const service = createConfigService(cache);
	const input: RuntimeConfig = {
		...DEFAULT_RUNTIME_CONFIG,
		maintenance: true,
		features: { beta: true },
	};

	assert.deepEqual(await service.updateConfig(input), input);
	assert.deepEqual(sets, [{ key: CONFIG_KEY, value: input }]);
	assert.deepEqual(await service.getConfig(), input);
	assert.equal(gets.length, 0);
});

test("updateConfig reports unavailable storage as 503", async () => {
	const { cache } = cacheFor({ setSucceeds: false });
	await assert.rejects(
		createConfigService(cache).updateConfig(DEFAULT_RUNTIME_CONFIG),
		(error: unknown) =>
			error instanceof ApiError &&
			error.status === 503 &&
			error.code === ApiErrorCode.SERVICE_UNAVAILABLE,
	);
});
