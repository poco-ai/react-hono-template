export const PLANS = {
	free: {
		price: 0,
		orgs: 1,
		members: 3,
		projects: 3,
		attachmentMaxSize: 10 * 1024 * 1024,
		apiRateLimit: 60,
		webhooks: 0,
	},
	pro: {
		price: 12,
		orgs: 10,
		members: 50,
		projects: 50,
		attachmentMaxSize: 50 * 1024 * 1024,
		apiRateLimit: 600,
		webhooks: 5,
	},
} as const;

export type PlanName = keyof typeof PLANS;

export type PlanLimits = (typeof PLANS)[PlanName];

export const isPlanName = (value: string): value is PlanName => value in PLANS;
