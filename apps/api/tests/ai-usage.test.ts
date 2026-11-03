import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode, PLANS } from "@workspace/shared";
import type { AiUsageDao, AiUsageTotals } from "../src/dao/ai-usage.dao";
import {
	createAiUsageService,
	estimateTokens,
	monthRange,
} from "../src/services/ai-usage.service";

const ORG_ID = "org-1";
const USER_ID = "user-1";
const NOW = new Date("2026-03-15T12:00:00.000Z");

const isApiError =
	(code: string, status?: number) =>
	(err: unknown): boolean =>
		err instanceof ApiError &&
		err.code === code &&
		(status === undefined || err.status === status);

const setup = (totals: Partial<AiUsageTotals> = {}) => {
	const calls = {
		sumBetween: [] as { orgId: string; fromDay: string; toDay: string }[],
		record: [] as unknown[],
	};
	const stored: AiUsageTotals = {
		requests: 0,
		inputTokens: 0,
		outputTokens: 0,
		toolCalls: 0,
		...totals,
	};
	const usageDao = {
		sumBetween: async (orgId: string, fromDay: string, toDay: string) => {
			calls.sumBetween.push({ orgId, fromDay, toDay });
			return stored;
		},
		record: async (data: unknown) => {
			calls.record.push(data);
		},
	} as unknown as AiUsageDao;
	return { usageDao, calls };
};

test("month ranges are UTC calendar months", () => {
	assert.deepEqual(monthRange(NOW), {
		month: "2026-03",
		fromDay: "2026-03-01",
		toDay: "2026-03-31",
	});
	assert.equal(estimateTokens("12345678"), 2);
	assert.equal(estimateTokens(""), 0);
});

test("usage summaries include plan limits and total tokens", async () => {
	const { usageDao, calls } = setup({
		requests: 4,
		inputTokens: 900,
		outputTokens: 100,
		toolCalls: 2,
	});
	const service = createAiUsageService({ usageDao, now: () => NOW });
	const summary = await service.monthSummary(ORG_ID, "free");
	assert.deepEqual(summary, {
		month: "2026-03",
		requests: 4,
		inputTokens: 900,
		outputTokens: 100,
		toolCalls: 2,
		totalTokens: 1000,
		limits: {
			plan: "free",
			monthlyTokens: PLANS.free.aiMonthlyTokens,
			requestsPerMinute: PLANS.free.aiRequestsPerMinute,
			maxSteps: PLANS.free.aiMaxSteps,
		},
	});
	assert.deepEqual(calls.sumBetween, [
		{ orgId: ORG_ID, fromDay: "2026-03-01", toDay: "2026-03-31" },
	]);
});

test("quota checks fail fast with an upgrade-friendly 429", async () => {
	const freeLimit = PLANS.free.aiMonthlyTokens;
	const { usageDao } = setup({ inputTokens: freeLimit - 500 });
	const service = createAiUsageService({ usageDao, now: () => NOW });

	await service.assertWithinQuota(ORG_ID, "free", 400);
	await assert.rejects(
		service.assertWithinQuota(ORG_ID, "free", 600),
		(err: unknown) => {
			assert.equal(isApiError(ApiErrorCode.AI_QUOTA_EXCEEDED, 429)(err), true);
			assert.equal(
				String((err as ApiError).message).includes("Upgrade to Pro"),
				true,
			);
			return true;
		},
	);
});

test("usage recording upserts one request for the UTC day", async () => {
	const { usageDao, calls } = setup();
	const service = createAiUsageService({ usageDao, now: () => NOW });
	await service.record({
		orgId: ORG_ID,
		userId: USER_ID,
		inputTokens: 120.9,
		outputTokens: 30,
		toolCalls: 2,
	});
	assert.deepEqual(calls.record, [
		{
			orgId: ORG_ID,
			userId: USER_ID,
			day: "2026-03-15",
			requests: 1,
			inputTokens: 120,
			outputTokens: 30,
			toolCalls: 2,
		},
	]);
});

test("chat rate limiting is tolerant without bindings and enforces limits", async () => {
	const { usageDao } = setup();
	const tolerant = createAiUsageService({ usageDao, now: () => NOW });
	await tolerant.assertRateLimit("free", `${ORG_ID}:${USER_ID}`);

	let receivedKey = "";
	const limited = createAiUsageService({
		usageDao,
		now: () => NOW,
		rateLimiters: {
			free: {
				limit: async ({ key }) => {
					receivedKey = key;
					return { success: false };
				},
			},
		},
	});
	await assert.rejects(
		limited.assertRateLimit("free", `${ORG_ID}:${USER_ID}`),
		isApiError(ApiErrorCode.AI_RATE_LIMITED, 429),
	);
	assert.equal(receivedKey, `${ORG_ID}:${USER_ID}`);

	const allowed = createAiUsageService({
		usageDao,
		now: () => NOW,
		rateLimiters: {
			pro: { limit: async () => ({ success: true }) },
		},
	});
	await allowed.assertRateLimit("pro", "org:user");
});
