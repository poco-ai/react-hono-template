import {
	ApiError,
	ApiErrorCode,
	PLANS,
	type PlanLimits,
	type PlanName,
} from "@workspace/shared";
import { createResourceCache } from "../lib/kv/resource-cache";
import type { CacheStore } from "../lib/kv/types";
import type {
	PlanAssert,
	PlanQuotaKind,
	PlanQuotaOptions,
	PlanSource,
} from "../lib/ports/plan";

const PLAN_CACHE_TTL_MS = 60_000;
// Billing changes invalidate explicitly; the long TTL is only a fallback that
// keeps KV writes well inside the free-tier daily quota.
const PLAN_KV_TTL_SECONDS = 3600;
const PLAN_KV_CACHE_TTL_SECONDS = 30;
const PLAN_KEY_PREFIX = "cache:v1:plan:";

/** Count quotas mirrored from `PLANS`; a `-1` limit means unlimited. */
export type QuotaKind = PlanQuotaKind;

const limitsFor = (plan: PlanName): PlanLimits => PLANS[plan];

const isPlanName = (value: unknown): value is PlanName =>
	value === "free" || value === "pro";

export const planCacheKey = (orgId: string) =>
	`${PLAN_KEY_PREFIX}${encodeURIComponent(orgId)}`;

const orgIdFromPlanKey = (key: string) =>
	decodeURIComponent(key.slice(PLAN_KEY_PREFIX.length));

export type PlanService = {
	getPlanForOrg: (orgId: string) => Promise<PlanName>;
	getLimitsForOrg: (orgId: string) => Promise<PlanLimits>;
	/**
	 * Asserts a count quota against the plan limit. `count` is only evaluated
	 * when the plan actually limits the kind (-1 means unlimited), so
	 * unmetered plans skip the counting query entirely. `message` may be a
	 * string or a `(plan, limit)` function when the copy needs the numbers.
	 */
	assertQuota: PlanAssert;
	invalidatePlanCache: (orgId: string) => Promise<void>;
};

export type QuotaAssert = (
	kind: QuotaKind,
	count: number | (() => Promise<number>),
	options?: PlanQuotaOptions,
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

/**
 * Plan source without a subscription store: every organization resolves to
 * the same plan. Trimmed presets (no billing) wire this so count quotas keep
 * enforcing `PLANS.free` limits.
 */
export const createStaticPlanSource = (
	plan: PlanName = "free",
): PlanSource => ({
	load: async () => plan,
});

export const createPlanService = (
	source: PlanSource,
	cache: CacheStore,
): PlanService => {
	// The resource cache owns the short-lived L1 map; billing changes must be
	// invalidated through this service instance.
	const plans = createResourceCache<PlanName>({
		cache,
		l1TtlMs: PLAN_CACHE_TTL_MS,
		ttlSeconds: PLAN_KV_TTL_SECONDS,
		cacheTtlSeconds: PLAN_KV_CACHE_TTL_SECONDS,
		parse: (stored) => (isPlanName(stored) ? stored : null),
		load: async (key) => {
			const plan = await source.load(orgIdFromPlanKey(key));
			return plan === "pro" ? "pro" : "free";
		},
	});

	const getPlanForOrg = (orgId: string): Promise<PlanName> =>
		plans.get(planCacheKey(orgId));

	return {
		getPlanForOrg,
		getLimitsForOrg: async (orgId) => limitsFor(await getPlanForOrg(orgId)),

		assertQuota: async (orgId, kind, count, options) =>
			quotaAssertFor(await getPlanForOrg(orgId))(kind, count, options),

		invalidatePlanCache: async (orgId) => {
			await plans.invalidate(planCacheKey(orgId));
		},
	};
};
