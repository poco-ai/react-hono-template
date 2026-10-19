import {
	ApiError,
	ApiErrorCode,
	PLANS,
	type PlanLimits,
	type PlanName,
} from "@workspace/shared";
import type { BillingDao } from "../dao/billing.dao";
import type { CacheStore } from "../lib/kv/types";

const PLAN_CACHE_TTL_MS = 60_000;
const PLAN_KV_TTL_SECONDS = 60;
const PLAN_KV_CACHE_TTL_SECONDS = 30;

type PlanCacheEntry = {
	plan: PlanName;
	fetchedAt: number;
};

const limitsFor = (plan: PlanName): PlanLimits => PLANS[plan];

const isPlanName = (value: unknown): value is PlanName =>
	value === "free" || value === "pro";

export const planCacheKey = (orgId: string) =>
	`cache:v1:plan:${encodeURIComponent(orgId)}`;

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
	invalidatePlanCache: (orgId: string) => Promise<void>;
};

export const createPlanService = (
	billingDao: BillingDao,
	cache: CacheStore,
): PlanService => {
	// Per-instance state: the cache must be invalidated through the injected service.
	const planCache = new Map<string, PlanCacheEntry>();

	const remember = (orgId: string, plan: PlanName) => {
		planCache.set(orgId, { plan, fetchedAt: Date.now() });
	};

	const fetchPlan = async (orgId: string): Promise<PlanName> => {
		const subscription = await billingDao.findByOrg(orgId);
		const plan = subscription.plan === "pro" ? "pro" : "free";
		remember(orgId, plan);
		try {
			await cache.set(planCacheKey(orgId), plan, {
				ttlSeconds: PLAN_KV_TTL_SECONDS,
			});
		} catch {
			// KV is a best-effort cache; a failed write must not fail the request.
		}
		return plan;
	};

	const getPlanForOrg = async (orgId: string): Promise<PlanName> => {
		const cached = planCache.get(orgId);
		if (cached && Date.now() - cached.fetchedAt < PLAN_CACHE_TTL_MS) {
			return cached.plan;
		}
		const stored = await cache.get<unknown>(planCacheKey(orgId), {
			cacheTtl: PLAN_KV_CACHE_TTL_SECONDS,
		});
		if (isPlanName(stored)) {
			remember(orgId, stored);
			return stored;
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

		invalidatePlanCache: async (orgId) => {
			planCache.delete(orgId);
			await cache.delete(planCacheKey(orgId));
		},
	};
};
