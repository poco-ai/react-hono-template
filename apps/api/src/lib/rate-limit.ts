export type RateLimiter = {
	limit: (options: { key: string }) => Promise<{ success: boolean }>;
};

export type PlanRateLimiters = {
	free?: RateLimiter;
	pro?: RateLimiter;
};
