import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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
