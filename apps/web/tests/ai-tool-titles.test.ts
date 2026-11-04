import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
	AI_TOOL_TITLE_KEYS,
	aiToolEffect,
	aiToolTitleKey,
} from "../src/features/ai/data";
import en from "../src/i18n/locales/en";
import zh from "../src/i18n/locales/zh";

const capabilitiesRoot = path.resolve(
	import.meta.dir,
	"../../api/src/capabilities",
);

/** Capability ids registered by the API read/write adapters. */
function capabilityNames(): string[] {
	const names = new Set<string>();
	for (const file of ["read.ts", "write.ts"]) {
		const source = readFileSync(path.join(capabilitiesRoot, file), "utf8");
		for (const match of source.matchAll(/^\s*name: "([a-z0-9_]+)",$/gm)) {
			names.add(match[1]);
		}
	}
	return [...names].sort();
}

/**
 * Capabilities that intentionally have no chat/tool-card title. Keep empty
 * unless a future capability is read-only plumbing the UI never renders.
 */
const IGNORED_CAPABILITIES = new Set<string>([]);

const lookup = (locale: typeof en, key: string): unknown =>
	key
		.split(".")
		.reduce<unknown>(
			(value, part) =>
				typeof value === "object" && value !== null
					? (value as Record<string, unknown>)[part]
					: undefined,
			locale,
		);

test("every API capability has a translated AI tool title", () => {
	const capabilities = capabilityNames();
	// Guard against the regex silently matching nothing after a refactor.
	assert.ok(capabilities.length > 20, `found ${capabilities.length}`);

	for (const name of capabilities) {
		if (IGNORED_CAPABILITIES.has(name)) {
			assert.equal(AI_TOOL_TITLE_KEYS[name], undefined, name);
			continue;
		}
		const key = aiToolTitleKey(name);
		assert.ok(key, `missing AI_TOOL_TITLE_KEYS entry for ${name}`);
		for (const [localeName, locale] of [
			["en", en],
			["zh", zh],
		] as const) {
			assert.equal(
				typeof lookup(locale, key),
				"string",
				`missing ${localeName} copy for ${name} (${key})`,
			);
		}
	}
});

test("tool effect classifies capability names for approval badges", () => {
	assert.equal(aiToolEffect("list_issues"), "read");
	assert.equal(aiToolEffect("create_issue"), "write");
	assert.equal(aiToolEffect("update_issue"), "write");
	assert.equal(aiToolEffect("delete_issue"), "destructive");
});
