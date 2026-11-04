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
// Billing changes invalidate explicitly; the long TTL is only a fallback that
// keeps KV writes well inside the free-tier daily quota.
const PLAN_KV_TTL_SECONDS = 3600;
const PLAN_KV_CACHE_TTL_SECONDS = 30;

type PlanCacheEntry = {
	plan: PlanName;
	fetchedAt: number;
};

/** Count quotas mirrored from `PLANS`; a `-1` limit means unlimited. */
export type QuotaKind =
	| "orgs"
	| "members"
	| "projects"
	| "webhooks"
	| "savedViews";

const limitsFor = (plan: PlanName): PlanLimits => PLANS[plan];

const isPlanName = (value: unknown): value is PlanName =>
	value === "free" || value === "pro";

export const planCacheKey = (orgId: string) =>
	`cache:v1:plan:${encodeURIComponent(orgId)}`;

export type PlanService = {
	getPlanForOrg: (orgId: string) => Promise<PlanName>;
	getLimitsForOrg: (orgId: string) => Promise<PlanLimits>;
	/**
	 * Asserts a count quota against the plan limit. `count` is only evaluated
	 * when the plan actually limits the kind (-1 means unlimited), so
	 * unmetered plans skip the counting query entirely. `message` may be a
	 * string or a `(plan, limit)` function when the copy needs the numbers.
	 */
	assertQuota: (
		orgId: string,
		kind: QuotaKind,
		count: number | (() => Promise<number>),
		options?: {
			code?: ApiErrorCode;
			message?: string | ((plan: PlanName, limit: number) => string);
			/** Copy used when the limit is 0 (the feature is Pro-only). */
			zeroLimitMessage?: string;
		},
	) => Promise<void>;
	invalidatePlanCache: (orgId: string) => Promise<void>;
};

export type QuotaAssert = (
	kind: QuotaKind,
	count: number | (() => Promise<number>),
	options?: {
		code?: ApiErrorCode;
		message?: string | ((plan: PlanName, limit: number) => string);
		/** Copy used when the limit is 0 (the feature is Pro-only). */
		zeroLimitMessage?: string;
	},
) => Promise<void>;

/**
 * Pure quota assertion for a known plan — the single implementation shared by
 * the service (which resolves the plan from the cache) and tests.
 */
export const quotaAssertFor =
	(plan: PlanName): QuotaAssert =>
	async (kind, count, options = {}) => {
		const limit = limitsFor(plan)[kind];
		if (limit < 0) {
			return; // unlimited
		}
		const current = typeof count === "function" ? await count() : count;
		if (current < limit) {
			return;
		}
		const message =
			limit === 0 && options.zeroLimitMessage
				? options.zeroLimitMessage
				: typeof options.message === "function"
					? options.message(plan, limit)
					: (options.message ??
						`Plan limit reached: the ${plan} plan allows up to ${limit} ${kind}. Upgrade to increase this limit.`);
		throw new ApiError(
			options.code ?? ApiErrorCode.PLAN_LIMIT_EXCEEDED,
			message,
		);
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
		await cache.set(planCacheKey(orgId), plan, {
			ttlSeconds: PLAN_KV_TTL_SECONDS,
		});
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

		assertQuota: async (orgId, kind, count, options) =>
			quotaAssertFor(await getPlanForOrg(orgId))(kind, count, options),

		invalidatePlanCache: async (orgId) => {
			planCache.delete(orgId);
			await cache.delete(planCacheKey(orgId));
		},
	};
};
