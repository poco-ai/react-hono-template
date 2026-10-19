import assert from "node:assert/strict";
import { test } from "node:test";
import type { BillingDao } from "../src/dao/billing.dao";
import type {
	CacheGetOptions,
	CacheSetOptions,
	CacheStore,
} from "../src/lib/kv/types";
import { createPlanService, planCacheKey } from "../src/services/plan.service";

const createFakeCache = ({
	initial = {} as Record<string, unknown>,
	setResult = true,
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
	return { store, calls };
};

const createFakeBillingDao = (initialPlan = "free") => {
	const calls = { findByOrg: 0 };
	const state = { plan: initialPlan };
	const dao = {
		findByOrg: async (orgId: string) => {
			assert.ok(orgId.length > 0);
			calls.findByOrg += 1;
			return { plan: state.plan };
		},
	} as unknown as BillingDao;
	return { dao, calls, state };
};

test("a D1 miss caches the normalized plan in KV and L1", async () => {
	const { dao, calls } = createFakeBillingDao("pro");
	const cache = createFakeCache();
	const service = createPlanService(dao, cache.store);

	assert.equal(await service.getPlanForOrg("org"), "pro");
	assert.equal(calls.findByOrg, 1);
	assert.deepEqual(cache.calls.gets, [
		{ key: "cache:v1:plan:org", cacheTtl: 30 },
	]);
	assert.deepEqual(cache.calls.sets, [
		{ key: "cache:v1:plan:org", value: "pro", ttlSeconds: 3600 },
	]);

	assert.equal(await service.getPlanForOrg("org"), "pro");
	assert.equal(calls.findByOrg, 1);
	assert.equal(cache.calls.gets.length, 1);
});

test("a valid KV hit is served without calling the DAO", async () => {
	const { dao, calls } = createFakeBillingDao("free");
	const cache = createFakeCache({
		initial: { [planCacheKey("org")]: "pro" },
	});
	const service = createPlanService(dao, cache.store);

	assert.equal(await service.getPlanForOrg("org"), "pro");
	assert.equal(calls.findByOrg, 0);
	assert.equal(cache.calls.sets.length, 0);

	assert.equal(await service.getPlanForOrg("org"), "pro");
	assert.equal(cache.calls.gets.length, 1);
});

test("invalid KV values fall through to D1", async () => {
	for (const value of ["enterprise", "PRO", 42, { plan: "pro" }]) {
		const { dao, calls } = createFakeBillingDao("free");
		const cache = createFakeCache({
			initial: { [planCacheKey("org")]: value },
		});
		const service = createPlanService(dao, cache.store);

		assert.equal(await service.getPlanForOrg("org"), "free");
		assert.equal(calls.findByOrg, 1);
		assert.deepEqual(cache.calls.sets, [
			{ key: "cache:v1:plan:org", value: "free", ttlSeconds: 3600 },
		]);
	}
});

test("invalidation clears L1 and the KV key so the next read hits D1", async () => {
	const { dao, calls, state } = createFakeBillingDao("pro");
	const key = planCacheKey("org");
	const cache = createFakeCache({ initial: { [key]: "pro" } });
	const service = createPlanService(dao, cache.store);

	assert.equal(await service.getPlanForOrg("org"), "pro");
	assert.equal(calls.findByOrg, 0);

	state.plan = "free";
	await service.invalidatePlanCache("org");
	assert.deepEqual(cache.calls.deletes, [key]);

	assert.equal(await service.getPlanForOrg("org"), "free");
	assert.equal(calls.findByOrg, 1);
	assert.equal(cache.calls.gets.length, 2);
});

test("a failed KV write still returns the plan", async () => {
	const { dao, calls } = createFakeBillingDao("pro");
	const cache = createFakeCache({ setResult: false });
	const service = createPlanService(dao, cache.store);

	assert.equal(await service.getPlanForOrg("org"), "pro");
	assert.equal(cache.calls.sets.length, 1);
	assert.equal(await service.getPlanForOrg("org"), "pro");
	assert.equal(calls.findByOrg, 1);
});

test("org ids containing slashes are encoded in the cache key", async () => {
	const { dao } = createFakeBillingDao("pro");
	const cache = createFakeCache();
	const service = createPlanService(dao, cache.store);

	assert.equal(planCacheKey("org/one"), "cache:v1:plan:org%2Fone");
	assert.equal(await service.getPlanForOrg("org/one"), "pro");
	assert.equal(cache.calls.gets[0]?.key, "cache:v1:plan:org%2Fone");
	assert.equal(cache.calls.sets[0]?.key, "cache:v1:plan:org%2Fone");
});
