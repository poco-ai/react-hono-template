import type { RedisLike } from "./client";

const LOCK_KEY = "cron:scheduled";

/** Matches the Worker cron that runs every 15 minutes. */
export const SCHEDULED_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Holds the lock until `ttlMs` expires so another replica cannot run the same
 * 15-minute pass. The lock is not released early.
 */
export const withRedisLock = async (
	redis: RedisLike,
	ttlMs: number,
	fn: () => Promise<void>,
): Promise<boolean> => {
	const acquired = await redis.set(LOCK_KEY, "1", "PX", ttlMs, "NX");
	if (acquired !== "OK") return false;
	await fn();
	return true;
};

export const startScheduledLoop = (
	redis: RedisLike,
	run: () => Promise<void>,
	intervalMs = SCHEDULED_INTERVAL_MS,
) => {
	const tick = () => {
		withRedisLock(redis, Math.max(intervalMs - 1000, 1000), run).catch(
			(error) => {
				console.error("[cron] scheduled pass failed:", error);
			},
		);
	};
	const timer = setInterval(tick, intervalMs);
	return () => clearInterval(timer);
};
