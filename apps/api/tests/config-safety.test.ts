import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PLANS } from "@workspace/shared";

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
});
