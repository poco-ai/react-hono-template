export const DEFAULT_RATE_LIMIT = 60;

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

type Bucket = {
	count: number;
	resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
	allowed: boolean;
	remaining: number;
	retryAfterSeconds: number;
	resetAfterSeconds: number;
};

export const checkRateLimit = (
	key: string,
	limit: number,
	windowMs: number = WINDOW_MS,
): RateLimitResult => {
	const now = Date.now();
	if (buckets.size > MAX_BUCKETS) {
		for (const [bucketKey, bucket] of buckets) {
			if (bucket.resetAt <= now) {
				buckets.delete(bucketKey);
			}
		}
	}
	const existing = buckets.get(key);
	if (!existing || existing.resetAt <= now) {
		const resetAt = now + windowMs;
		buckets.set(key, { count: 1, resetAt });
		return {
			allowed: true,
			remaining: limit - 1,
			retryAfterSeconds: 0,
			resetAfterSeconds: Math.ceil(windowMs / 1000),
		};
	}
	existing.count += 1;
	if (existing.count > limit) {
		return {
			allowed: false,
			remaining: 0,
			retryAfterSeconds: Math.max(
				1,
				Math.ceil((existing.resetAt - now) / 1000),
			),
			resetAfterSeconds: Math.max(
				1,
				Math.ceil((existing.resetAt - now) / 1000),
			),
		};
	}
	return {
		allowed: true,
		remaining: limit - existing.count,
		retryAfterSeconds: 0,
		resetAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
	};
};
