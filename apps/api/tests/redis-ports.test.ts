import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createRedisCache } from "../src/core/lib/redis/cache";
import type { RedisLike } from "../src/core/lib/redis/client";
import { createRedisRateLimiter } from "../src/core/lib/redis/rate-limit";
import { withRedisLock } from "../src/core/lib/redis/scheduler";
import {
	createRedisWebhookQueue,
	drainWebhookQueue,
	startWebhookLoop,
} from "../src/core/lib/redis/webhook-queue";
import type { WebhookDeliveryService } from "../src/features/webhooks/services/webhook-delivery.service";

class MemoryRedis implements RedisLike {
	private strings = new Map<string, { value: string; expiresAt?: number }>();
	private lists = new Map<string, string[]>();
	private zsets = new Map<string, { member: string; score: number }[]>();
	private hashes = new Map<string, Map<string, string>>();

	private live(key: string) {
		const row = this.strings.get(key);
		if (!row) return null;
		if (row.expiresAt !== undefined && row.expiresAt <= Date.now()) {
			this.strings.delete(key);
			return null;
		}
		return row;
	}

	async get(key: string) {
		return this.live(key)?.value ?? null;
	}

	async set(
		key: string,
		value: string,
		mode?: "PX" | "EX",
		ttl?: number,
		condition?: "NX",
	) {
		if (condition === "NX" && this.live(key)) return null;
		let expiresAt: number | undefined;
		if (mode === "PX" && ttl !== undefined) expiresAt = Date.now() + ttl;
		if (mode === "EX" && ttl !== undefined) expiresAt = Date.now() + ttl * 1000;
		this.strings.set(key, { value, expiresAt });
		return "OK" as const;
	}

	async del(key: string) {
		return this.strings.delete(key) ? 1 : 0;
	}

	async incr(key: string) {
		const next = Number(this.live(key)?.value ?? "0") + 1;
		const existing = this.strings.get(key);
		this.strings.set(key, {
			value: String(next),
			expiresAt: existing?.expiresAt,
		});
		return next;
	}

	async pexpire(key: string, ttlMs: number) {
		const row = this.live(key);
		if (!row) return 0;
		row.expiresAt = Date.now() + ttlMs;
		return 1;
	}

	async lpush(key: string, value: string) {
		const list = this.lists.get(key) ?? [];
		list.unshift(value);
		this.lists.set(key, list);
		return list.length;
	}

	async rpop(key: string) {
		const list = this.lists.get(key) ?? [];
		const value = list.pop() ?? null;
		this.lists.set(key, list);
		return value;
	}

	async zadd(key: string, score: number, member: string) {
		const rows = this.zsets.get(key) ?? [];
		const existing = rows.find((row) => row.member === member);
		if (existing) existing.score = score;
		else rows.push({ member, score });
		this.zsets.set(key, rows);
		return existing ? 0 : 1;
	}

	async zrangebyscore(key: string, min: number, max: number) {
		return (this.zsets.get(key) ?? [])
			.filter((row) => row.score >= min && row.score <= max)
			.map((row) => row.member);
	}

	async zrem(key: string, member: string) {
		const rows = this.zsets.get(key) ?? [];
		const next = rows.filter((row) => row.member !== member);
		this.zsets.set(key, next);
		return rows.length - next.length;
	}

	async hset(key: string, field: string, value: string) {
		const hash = this.hashes.get(key) ?? new Map<string, string>();
		const created = hash.has(field) ? 0 : 1;
		hash.set(field, value);
		this.hashes.set(key, hash);
		return created;
	}

	async hgetall(key: string) {
		return Object.fromEntries(this.hashes.get(key) ?? []);
	}

	async hdel(key: string, field: string) {
		const hash = this.hashes.get(key);
		if (!hash?.delete(field)) return 0;
		return 1;
	}

	async quit() {
		return "OK";
	}
}

test("redis cache round-trips json through the shared store", async () => {
	const cache = createRedisCache(new MemoryRedis());
	assert.equal(
		await cache.set("config:global", { theme: "dark" }, { ttlSeconds: 10 }),
		true,
	);
	assert.deepEqual(await cache.get("config:global"), { theme: "dark" });
	assert.equal(await cache.delete("config:global"), true);
	assert.equal(await cache.get("config:global"), null);
});

test("redis rate limiter closes the window after the plan limit", async () => {
	const limiter = createRedisRateLimiter(new MemoryRedis(), 2, "api:test");
	assert.equal((await limiter.limit({ key: "one" })).success, true);
	assert.equal((await limiter.limit({ key: "one" })).success, true);
	assert.equal((await limiter.limit({ key: "one" })).success, false);
	assert.equal((await limiter.limit({ key: "two" })).success, true);
});

test("redis lock is held until the ttl expires", async () => {
	const redis = new MemoryRedis();
	let runs = 0;
	assert.equal(
		await withRedisLock(redis, 60_000, async () => {
			runs += 1;
		}),
		true,
	);
	assert.equal(
		await withRedisLock(redis, 60_000, async () => {
			runs += 1;
		}),
		false,
	);
	assert.equal(runs, 1);
});

test("webhook jobs are consumed from the redis list", async () => {
	const redis = new MemoryRedis();
	const queue = createRedisWebhookQueue(redis);
	const seen: string[] = [];
	const deliveries = {
		deliverFromQueue: async (deliveryId: string) => {
			seen.push(deliveryId);
			return "success" as const;
		},
	} as unknown as WebhookDeliveryService;
	await queue.send({ deliveryId: "del-1" });
	assert.equal(await drainWebhookQueue(redis, deliveries), 1);
	assert.deepEqual(seen, ["del-1"]);
	assert.equal(await drainWebhookQueue(redis, deliveries), 0);
});

test("webhook polling avoids overlapping drains and finishes the active delivery on stop", async () => {
	const redis = new MemoryRedis();
	const queue = createRedisWebhookQueue(redis);
	const seen: string[] = [];
	const started = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const deliveries = {
		deliverFromQueue: async (deliveryId: string) => {
			seen.push(deliveryId);
			if (deliveryId === "del-1") {
				started.resolve();
				await release.promise;
			}
			return "success" as const;
		},
	} as unknown as WebhookDeliveryService;
	await queue.send({ deliveryId: "del-1" });
	await queue.send({ deliveryId: "del-2" });
	const stop = startWebhookLoop(redis, deliveries, 1);
	try {
		await started.promise;
		await delay(20);
		assert.deepEqual(seen, ["del-1"]);

		let stopped = false;
		const stopping = stop().then(() => {
			stopped = true;
		});
		await delay(0);
		assert.equal(stopped, false);
		release.resolve();
		await stopping;
		assert.deepEqual(seen, ["del-1"]);
		assert.deepEqual(await redis.hgetall("webhook:processing"), {});
		assert.equal(await drainWebhookQueue(redis, deliveries), 1);
		assert.deepEqual(seen, ["del-1", "del-2"]);
	} finally {
		release.resolve();
		await stop();
	}
});
