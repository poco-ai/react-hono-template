import assert from "node:assert/strict";
import { test } from "node:test";
import {
	customBaseFeatures,
	deriveDocs,
	resolveSelection,
} from "../src/manifest";

/**
 * Selection-resolution regression net for the create-app CLI (Phase 2).
 *
 * Preset expansion stays compatible with the Phase 1 behavior (extends
 * chains, dependency validation), while the custom `--features` path locks
 * onto the minimal base, closes hard dependencies transitively and derives
 * its docs set from the enabled features' claims.
 */

const MINIMAL = customBaseFeatures();

const BASE_DOCS = [
	"README.md",
	"docs/本地开发.md",
	"docs/部署.md",
	"docs/环境变量.md",
	"docs/架构.md",
];

test("preset mode: minimal expands to the nine baseline features", () => {
	const selection = resolveSelection({ preset: "minimal" });
	assert.equal(selection.mode, "preset");
	assert.equal(selection.name, "minimal");
	assert.equal(selection.features.length, 9);
	assert.deepEqual(
		selection.features.map((feature) => feature.id),
		MINIMAL,
	);
	assert.ok(selection.enabled.has("search"));
	assert.ok(selection.enabled.has("notifications"));
});

test("preset mode: extends chains expand in order (saas)", () => {
	const selection = resolveSelection({ preset: "saas" });
	// saas extends collaboration extends minimal.
	assert.deepEqual(
		selection.features.slice(0, MINIMAL.length).map((feature) => feature.id),
		MINIMAL,
	);
	for (const id of [
		"attachments",
		"webhooks",
		"favorites",
		"relations",
		"project-updates",
		"cycles",
		"roadmap",
		"recurrences",
		"views",
		"templates",
		"billing",
		"api-keys",
		"public-api",
	]) {
		assert.ok(selection.enabled.has(id), `saas should include "${id}"`);
	}
	assert.equal(selection.features.length, 22);
	// Docs lists inherit through `extends`: saas declares none of its own.
	assert.deepEqual(selection.decl.docs, [
		"README.md",
		"docs/本地开发.md",
		"docs/部署.md",
	]);
});

test("preset mode: unknown presets fail with the available list", () => {
	assert.throws(
		() => resolveSelection({ preset: "nope" }),
		/unknown preset "nope" \(available: ai, collaboration, full, minimal, planning, saas\)/,
	);
});

test("custom mode: the minimal base is always locked in", () => {
	const selection = resolveSelection({ features: ["core"] });
	assert.equal(selection.mode, "custom");
	assert.equal(selection.name, "custom");
	assert.equal(selection.decl.name, "custom");
	assert.deepEqual(
		selection.features.map((feature) => feature.id),
		MINIMAL,
	);
});

test("custom mode: billing adds its hard-dependency closure", () => {
	const selection = resolveSelection({ features: ["billing"] });
	// billing hard-depends on webhooks and attachments; neither is in the
	// minimal base, so only the closure can bring them in.
	for (const id of [...MINIMAL, "billing", "webhooks", "attachments"]) {
		assert.ok(selection.enabled.has(id), `billing selection needs "${id}"`);
	}
	assert.equal(selection.features.length, MINIMAL.length + 3);
	assert.deepEqual(selection.decl.features, [
		...MINIMAL,
		"billing",
		"webhooks",
		"attachments",
	]);
	assert.deepEqual(selection.decl.docs, BASE_DOCS);
});

test("custom mode: hard dependencies close transitively", () => {
	// mcp -> ai -> favorites: favorites is neither in the minimal base nor a
	// direct dependency of mcp, so it can only arrive via the closure.
	const selection = resolveSelection({ features: ["mcp"] });
	for (const id of ["mcp", "ai", "capabilities", "api-keys", "favorites"]) {
		assert.ok(selection.enabled.has(id), `mcp closure needs "${id}"`);
	}
});

test("custom mode: unknown and duplicate ids fail with the available list", () => {
	assert.throws(
		() => resolveSelection({ features: ["nope"] }),
		/unknown feature "nope" \(available: /,
	);
	assert.throws(
		() => resolveSelection({ features: ["billing", "billing"] }),
		/duplicate feature "billing" in --features/,
	);
});

test("deriveDocs: feature docs follow the enabled set", () => {
	const withAi = new Set([...MINIMAL, "ai"]);
	assert.ok(deriveDocs(withAi).includes("docs/AI与MCP.md"));
	const withoutAi = new Set(MINIMAL);
	assert.ok(!deriveDocs(withoutAi).includes("docs/AI与MCP.md"));
	assert.deepEqual(deriveDocs(withoutAi), BASE_DOCS);
});
