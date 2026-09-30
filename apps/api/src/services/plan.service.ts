import {
	ApiError,
	ApiErrorCode,
	PLANS,
	type PlanLimits,
	type PlanName,
} from "@workspace/shared";
import type { SubscriptionDao } from "../dao/subscription.dao";

export const assertWithinLimit = (
	kind: string,
	currentCount: number,
	limit: number,
	plan: PlanName = "free",
	message?: string,
) => {
	if (currentCount >= limit) {
		throw new ApiError(
			403,
			ApiErrorCode.PLAN_LIMIT_EXCEEDED,
			message ??
				`Plan limit reached: the ${plan} plan allows up to ${limit} ${kind}. Upgrade to increase this limit.`,
		);
	}
};

export const planLimits = (plan: PlanName): PlanLimits => PLANS[plan];

const PLAN_CACHE_TTL_MS = 60_000;

type PlanCacheEntry = {
	plan: PlanName;
	fetchedAt: number;
};

const planCache = new Map<string, PlanCacheEntry>();

export const invalidatePlanCache = (orgId: string) => {
	planCache.delete(orgId);
};

export type PlanService = {
	getPlanForOrg: (orgId: string) => Promise<PlanName>;
	getLimitsForOrg: (orgId: string) => Promise<PlanLimits>;
};

export const createPlanService = (
	subscriptionDao: SubscriptionDao,
): PlanService => {
	const fetchPlan = async (orgId: string): Promise<PlanName> => {
		const subscription = await subscriptionDao.findByOrg(orgId);
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
		getLimitsForOrg: async (orgId) => planLimits(await getPlanForOrg(orgId)),
	};
};
