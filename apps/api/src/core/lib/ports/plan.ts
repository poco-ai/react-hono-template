import type { ApiErrorCode, PlanLimits, PlanName } from "@workspace/shared";

/**
 * Ports: plan lookup and quota assertion shapes consumed by core and Tier 1/2
 * services (projects, webhooks, auth-policy, attachments...).
 *
 * The types live in core so those services keep compiling when the billing
 * feature is trimmed from a preset — `plan.service` satisfies them
 * structurally and is injected at assembly time.
 */

/** Count quotas mirrored from `PLANS`; a `-1` limit means unlimited. */
export type PlanQuotaKind =
	| "orgs"
	| "members"
	| "projects"
	| "webhooks"
	| "savedViews";

export type PlanQuotaOptions = {
	code?: ApiErrorCode;
	message?: string | ((plan: PlanName, limit: number) => string);
	/** Copy used when the limit is 0 (the feature is Pro-only). */
	zeroLimitMessage?: string;
};

/**
 * Asserts a count quota against the plan limit. `count` is only evaluated
 * when the plan actually limits the kind (-1 means unlimited).
 */
export type PlanAssert = (
	orgId: string,
	kind: PlanQuotaKind,
	count: number | (() => Promise<number>),
	options?: PlanQuotaOptions,
) => Promise<void>;

/** Plan-name lookup (the minimal surface quota checks need). */
export type PlanNameSource = {
	getPlanForOrg: (orgId: string) => Promise<PlanName>;
};

/** Plan-limits lookup (attachment size and storage caps). */
export type PlanLimitsSource = {
	getLimitsForOrg: (orgId: string) => Promise<PlanLimits>;
};

/**
 * Subscription store behind the plan service cache. The billing feature
 * provides a DB-backed source; a trimmed preset wires a static one.
 */
export type PlanSource = {
	load: (orgId: string) => Promise<PlanName>;
};

/**
 * Mutable holder around a PlanSource. Core builds `plan.service` before any
 * feature registers (auth-policy and most services inject it), but the
 * DB-backed source only exists once the billing feature contributes it. The
 * holder exposes one stable PlanSource that forwards every read to the
 * current implementation, so swapping the source after assembly is invisible
 * to consumers.
 */
export const createPlanSourceHolder = (initial: PlanSource) => {
	let current = initial;
	return {
		source: {
			load: (orgId: string) => current.load(orgId),
		} satisfies PlanSource,
		set: (next: PlanSource) => {
			current = next;
		},
	};
};
