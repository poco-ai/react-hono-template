import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PLANS } from "@workspace/shared";
import { RATE_LIMIT_WINDOW_MS } from "../src/lib/rate-limit";
import { SCHEDULED_INTERVAL_MS } from "../src/lib/redis/scheduler";
import {
	WEBHOOK_MAX_ATTEMPTS,
	WEBHOOK_RETRY_DELAY_MS,
} from "../src/services/webhook-delivery.service";

const wranglerConfig = readFileSync(
	fileURLToPath(new URL("../wrangler.jsonc", import.meta.url).href),
	"utf8",
);

const enabledPattern = (name: string) =>
	new RegExp(`"${name}"\\s*:\\s*(?:"true"|true)`);

test("production worker config never enables local-only shortcuts", () => {
	for (const name of [
		"BILLING_MOCK_MODE",
		"AUTH_ALLOW_INSECURE_LOGGING",
		"ALLOW_FIRST_USER_ADMIN",
		"MCP_DCR_ENABLED",
	]) {
		assert.doesNotMatch(
			wranglerConfig,
			enabledPattern(name),
			`${name} must stay disabled in the deployed worker config`,
		);
	}
});

test("the local-only guard catches string and boolean true", () => {
	assert.match('{"FLAG": "true"}', enabledPattern("FLAG"));
	assert.match('{"FLAG": true}', enabledPattern("FLAG"));
	assert.doesNotMatch('{"FLAG": false}', enabledPattern("FLAG"));
});

const rateLimitFor = (name: string): number => {
	const match = wranglerConfig.match(
		new RegExp(`"name":\\s*"${name}"[\\s\\S]*?"limit":\\s*(\\d+)`),
	);
	assert.ok(match, `missing ${name} in wrangler.jsonc`);
	return Number(match[1]);
};

test("wrangler rate limits stay aligned with PLANS", () => {
	assert.equal(rateLimitFor("RATE_LIMITER_FREE"), PLANS.free.apiRateLimit);
	assert.equal(rateLimitFor("RATE_LIMITER_PRO"), PLANS.pro.apiRateLimit);
	assert.equal(
		rateLimitFor("RATE_LIMITER_AI_FREE"),
		PLANS.free.aiRequestsPerMinute,
	);
	assert.equal(
		rateLimitFor("RATE_LIMITER_AI_PRO"),
		PLANS.pro.aiRequestsPerMinute,
	);
	for (const name of [
		"RATE_LIMITER_FREE",
		"RATE_LIMITER_PRO",
		"RATE_LIMITER_AI_FREE",
		"RATE_LIMITER_AI_PRO",
	]) {
		const match = wranglerConfig.match(
			new RegExp(`"name":\\s*"${name}"[\\s\\S]*?"period":\\s*(\\d+)`),
		);
		assert.ok(match, `missing period for ${name}`);
		assert.equal(Number(match[1]) * 1000, RATE_LIMIT_WINDOW_MS);
	}
});

test("webhook retry and cron interval match the worker config", () => {
	assert.match(wranglerConfig, /"max_retries":\s*2/);
	assert.equal(WEBHOOK_MAX_ATTEMPTS, 3);
	const retryDelay = wranglerConfig.match(/"retry_delay":\s*(\d+)/);
	assert.ok(retryDelay);
	assert.equal(Number(retryDelay[1]) * 1000, WEBHOOK_RETRY_DELAY_MS);
	assert.match(wranglerConfig, /"\*\/15 \* \* \* \*"/);
	assert.equal(SCHEDULED_INTERVAL_MS, 15 * 60 * 1000);
});
