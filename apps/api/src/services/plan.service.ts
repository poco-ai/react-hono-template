import {
	ApiError,
	ApiErrorCode,
	PLANS,
	type PlanLimits,
	type PlanName,
} from "@workspace/shared";
import type { BillingDao } from "../dao/billing.dao";

const PLAN_CACHE_TTL_MS = 60_000;

type PlanCacheEntry = {
	plan: PlanName;
	fetchedAt: number;
};

const limitsFor = (plan: PlanName): PlanLimits => PLANS[plan];

export type PlanService = {
	getPlanForOrg: (orgId: string) => Promise<PlanName>;
	getLimitsForOrg: (orgId: string) => Promise<PlanLimits>;
	assertWithinLimit: (
		kind: string,
		currentCount: number,
		limit: number,
		plan?: PlanName,
		message?: string,
	) => void;
	invalidatePlanCache: (orgId: string) => void;
};

export const createPlanService = (billingDao: BillingDao): PlanService => {
	// Per-instance state: the cache must be invalidated through the injected service.
	const planCache = new Map<string, PlanCacheEntry>();

	const fetchPlan = async (orgId: string): Promise<PlanName> => {
		const subscription = await billingDao.findByOrg(orgId);
		const plan = subscription.plan === "pro" ? "pro" : "free";
		planCache.set(orgId, { plan, fetchedAt: Date.now() });
		return plan;
	};

	const getPlanForOrg = async (orgId: string): Promise<PlanName> => {
		const cached = planCache.get(orgId);
		if (cached && Date.now() - cached.fetchedAt < PLAN_CACHE_TTL_MS) {
			return cached.plan;
		}
		return fetchPlan(orgId);
	};

	return {
		getPlanForOrg,
		getLimitsForOrg: async (orgId) => limitsFor(await getPlanForOrg(orgId)),

		assertWithinLimit: (kind, currentCount, limit, plan = "free", message) => {
			if (currentCount >= limit) {
				throw new ApiError(
					403,
					ApiErrorCode.PLAN_LIMIT_EXCEEDED,
					message ??
						`Plan limit reached: the ${plan} plan allows up to ${limit} ${kind}. Upgrade to increase this limit.`,
				);
			}
		},

		invalidatePlanCache: (orgId) => {
			planCache.delete(orgId);
		},
	};
};
