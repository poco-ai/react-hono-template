import Redis from "ioredis";

/**
 * Structural Redis surface used by cache, rate limits and the webhook queue.
 * Tests can pass an in-memory fake; production uses ioredis.
 */
export type RedisLike = {
	get(key: string): Promise<string | null>;
	set(
		key: string,
		value: string,
		expiryMode: "PX",
		ttlMs: number,
		condition: "NX",
	): Promise<"OK" | null>;
	set(
		key: string,
		value: string,
		expiryMode: "EX",
		ttlSeconds: number,
	): Promise<"OK" | null>;
	set(key: string, value: string): Promise<"OK" | null>;
	del(key: string): Promise<number>;
	incr(key: string): Promise<number>;
	pexpire(key: string, ttlMs: number): Promise<number>;
	lpush(key: string, value: string): Promise<number>;
	rpop(key: string): Promise<string | null>;
	zadd(key: string, score: number, member: string): Promise<number>;
	zrangebyscore(key: string, min: number, max: number): Promise<string[]>;
	zrem(key: string, member: string): Promise<number>;
	hset(key: string, field: string, value: string): Promise<number>;
	hgetall(key: string): Promise<Record<string, string>>;
	hdel(key: string, field: string): Promise<number>;
	quit(): Promise<unknown>;
};

export const createRedisClient = (url: string): RedisLike =>
	new Redis(url, {
		maxRetriesPerRequest: 2,
		enableReadyCheck: true,
	}) as unknown as RedisLike;
