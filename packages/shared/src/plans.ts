export const PLANS = {
	free: {
		price: 0,
		orgs: 1,
		members: 3,
		projects: 3,
		attachmentMaxSize: 10 * 1024 * 1024,
		storageBytes: 100 * 1024 * 1024,
		attachmentsPerIssue: 10,
		attachmentsPerComment: 3,
		apiRateLimit: 60,
		webhooks: 0,
		aiMonthlyTokens: 50_000,
		aiRequestsPerMinute: 10,
		aiMaxSteps: 4,
	},
	pro: {
		price: 12,
		orgs: 10,
		members: 50,
		projects: 50,
		attachmentMaxSize: 50 * 1024 * 1024,
		storageBytes: 5 * 1024 * 1024 * 1024,
		attachmentsPerIssue: 50,
		attachmentsPerComment: 10,
		apiRateLimit: 600,
		webhooks: 5,
		aiMonthlyTokens: 1_000_000,
		aiRequestsPerMinute: 60,
		aiMaxSteps: 12,
	},
} as const;

export type PlanName = keyof typeof PLANS;

export type PlanLimits = (typeof PLANS)[PlanName];

export const isPlanName = (value: string): value is PlanName => value in PLANS;
