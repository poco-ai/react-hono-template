/** Fixed one-minute window. Cloudflare's `period` and the Redis counter use this. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

export type RateLimiter = {
	limit: (options: { key: string }) => Promise<{ success: boolean }>;
};

export type PlanRateLimiters = {
	free?: RateLimiter;
	pro?: RateLimiter;
};
