import {
	ApiError,
	ApiErrorCode,
	PLANS,
	type PlanName,
} from "@workspace/shared";
import type { AiUsageDao } from "../dao/ai-usage.dao";
import type { AiUsageLimitsDto, AiUsageTotalsDto } from "../dto/ai.dto";

/**
 * Minimal structural type of the Workers rate-limit binding. Declared locally
 * so services stay importable outside workerd and tolerate missing bindings in
 * unit tests.
 */
export type AiRateLimiter = {
	limit: (options: { key: string }) => Promise<{ success: boolean }>;
};

export type AiRateLimiters = {
	free?: AiRateLimiter;
	pro?: AiRateLimiter;
};

const dayOf = (date: Date): string => date.toISOString().slice(0, 10);

export const monthRange = (
	now: Date = new Date(),
): { month: string; fromDay: string; toDay: string } => {
	const year = now.getUTCFullYear();
	const monthIndex = now.getUTCMonth();
	const fromDay = dayOf(new Date(Date.UTC(year, monthIndex, 1)));
	const toDay = dayOf(new Date(Date.UTC(year, monthIndex + 1, 0)));
	return {
		month: fromDay.slice(0, 7),
		fromDay,
		toDay,
	};
};

/** Rough token estimate: ~4 characters per token. */
export const estimateTokens = (text: string): number =>
	Math.ceil(text.length / 4);

export const limitsForPlan = (plan: PlanName): AiUsageLimitsDto => ({
	plan,
	monthlyTokens: PLANS[plan].aiMonthlyTokens,
	requestsPerMinute: PLANS[plan].aiRequestsPerMinute,
	maxSteps: PLANS[plan].aiMaxSteps,
});

export const createAiUsageService = ({
	usageDao,
	rateLimiters,
	now = () => new Date(),
}: {
	usageDao: AiUsageDao;
	rateLimiters?: AiRateLimiters;
	now?: () => Date;
}) => {
	const monthSummary = async (
		orgId: string,
		plan: PlanName,
	): Promise<AiUsageTotalsDto & { limits: AiUsageLimitsDto }> => {
		const range = monthRange(now());
		const totals = await usageDao.sumBetween(orgId, range.fromDay, range.toDay);
		return {
			month: range.month,
			...totals,
			totalTokens: totals.inputTokens + totals.outputTokens,
			limits: limitsForPlan(plan),
		};
	};

	return {
		monthSummary,

		/**
		 * Fails fast when the current month plus the estimated prompt and the
		 * maximum response would exceed the plan's token allowance.
		 */
		assertWithinQuota: async (
			orgId: string,
			plan: PlanName,
			estimatedTokens: number,
		): Promise<void> => {
			const summary = await monthSummary(orgId, plan);
			const projected = summary.totalTokens + estimatedTokens;
			if (projected > summary.limits.monthlyTokens) {
				const upgrade =
					plan === "free"
						? " Upgrade to Pro for a larger monthly AI quota."
						: "";
				throw new ApiError(
					ApiErrorCode.AI_QUOTA_EXCEEDED,
					`Monthly AI token quota exceeded: ${summary.totalTokens} of ${summary.limits.monthlyTokens} tokens used on the ${plan} plan.${upgrade}`,
				);
			}
		},

		record: async (input: {
			orgId: string;
			userId: string;
			inputTokens: number;
			outputTokens: number;
			toolCalls: number;
		}): Promise<void> => {
			await usageDao.record({
				orgId: input.orgId,
				userId: input.userId,
				day: dayOf(now()),
				requests: 1,
				inputTokens: Math.max(0, Math.trunc(input.inputTokens)),
				outputTokens: Math.max(0, Math.trunc(input.outputTokens)),
				toolCalls: Math.max(0, Math.trunc(input.toolCalls)),
			});
		},

		assertRateLimit: async (plan: PlanName, key: string): Promise<void> => {
			const limiter = plan === "pro" ? rateLimiters?.pro : rateLimiters?.free;
			if (!limiter) return;
			const { success } = await limiter.limit({ key });
			if (!success) {
				throw new ApiError(
					ApiErrorCode.AI_RATE_LIMITED,
					`AI rate limit exceeded: max ${PLANS[plan].aiRequestsPerMinute} chat requests per minute.`,
				);
			}
		},
	};
};

export type AiUsageService = ReturnType<typeof createAiUsageService>;
