import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	type FeatureDecl,
	featureDeclSchema,
	presetDeclSchema,
} from "../../../presets/schema";

/**
 * Phase 0 architecture guardrails for the template refactor
 * (docs/模板化重构方案.md §4).
 *
 * 1. `presets/features/*.json` and `presets/presets/*.json` validate against
 *    the zod schemas; the dependency graph is acyclic and hard dependencies
 *    never point to a higher tier.
 * 2. Claims coverage: every business source file under the scanned roots is
 *    owned by exactly one feature (composition roots are exempt).
 * 3. Feature boundaries: every import between two owned files must stay
 *    within `{self} ∪ dependsOn ∪ softDependsOn`.
 *
 * Import specifiers are resolved for relative paths plus the workspace
 * aliases that reach claimed code: `@/` (apps/web/src), `@api/` (apps/api/src)
 * and `@workspace/shared` (packages/shared/src). Everything else (bare
 * package imports, `@workspace/ui`, web `lib/`...) is outside the scanned
 * roots and ignored.
 */

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../..",
);
const PRESETS_ROOT = path.join(REPO_ROOT, "presets");
const API_SRC = path.join(REPO_ROOT, "apps/api/src");
const WEB_SRC = path.join(REPO_ROOT, "apps/web/src");
const SHARED_SRC = path.join(REPO_ROOT, "packages/shared/src");

const SCAN_ROOTS = [
	"apps/api/src",
	"apps/web/src/features",
	"packages/shared/src",
];

/** Composition roots and infrastructure that no feature claims (Phase 2/3). */
const EXEMPT_FILES = new Set([
	"apps/api/src/app.ts",
	"apps/api/src/dependencies.ts",
	"apps/api/src/env.d.ts",
	"apps/api/src/index.ts",
	"apps/api/src/queue.ts",
	"apps/api/src/routes.ts",
	"apps/api/src/scheduled.ts",
	"apps/api/src/serve.ts",
	"apps/api/src/server.ts",
]);

const EXEMPT_PREFIXES = ["apps/api/src/db/"];

/**
 * Files that are claimed (for coverage) but act as composition roots for
 * boundary purposes: the shared barrel re-exports every feature schema by
 * design in the full-form template repo and is split per feature in Phase 2.
 */
const BOUNDARY_EXEMPT_FILES = new Set(["packages/shared/src/index.ts"]);

function isExempt(relPath: string): boolean {
	return (
		EXEMPT_FILES.has(relPath) ||
		EXEMPT_PREFIXES.some((prefix) => relPath.startsWith(prefix))
	);
}

function toRel(absolute: string): string {
	return path.relative(REPO_ROOT, absolute).split(path.sep).join("/");
}

function isFile(absolute: string): boolean {
	return existsSync(absolute) && statSync(absolute).isFile();
}

function walk(absoluteDir: string): string[] {
	const entries = readdirSync(absoluteDir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const absolute = path.join(absoluteDir, entry.name);
		if (entry.isDirectory()) {
			files.push(...walk(absolute));
		} else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
			files.push(toRel(absolute));
		}
	}
	return files;
}

/** Minimal glob → RegExp conversion supporting `**`, `*` and `?`. */
function globToRegExp(pattern: string): RegExp {
	let source = "";
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		if (char === "*") {
			if (pattern[i + 1] === "*") {
				source += ".*";
				i++;
			} else {
				source += "[^/]*";
			}
		} else if (char === "?") {
			source += "[^/]";
		} else {
			source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
		}
	}
	return new RegExp(`^${source}$`);
}

function readJson(absolute: string): unknown {
	return JSON.parse(readFileSync(absolute, "utf8"));
}

function loadJsonDir(
	relativeDir: string,
): Map<string, { stem: string; data: unknown }> {
	const dir = path.join(PRESETS_ROOT, relativeDir);
	const loaded = new Map<string, { stem: string; data: unknown }>();
	for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
		a.name.localeCompare(b.name),
	)) {
		if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
		const stem = entry.name.slice(0, -".json".length);
		loaded.set(stem, {
			stem,
			data: readJson(path.join(dir, entry.name)),
		});
	}
	return loaded;
}

const featureFiles = loadJsonDir("features");
const presetFiles = loadJsonDir("presets");

const features = new Map<string, FeatureDecl>(
	[...featureFiles.entries()].map(([stem, { data }]) => {
		const decl = featureDeclSchema.parse(data);
		assert.equal(
			decl.id,
			stem,
			`presets/features/${stem}.json declares id "${decl.id}"`,
		);
		return [decl.id, decl];
	}),
);

const presets = new Map(
	[...presetFiles.entries()].map(([stem, { data }]) => {
		const decl = presetDeclSchema.parse(data);
		assert.equal(
			decl.name,
			stem,
			`presets/presets/${stem}.json declares name "${decl.name}"`,
		);
		return [decl.name, decl];
	}),
);

function expandPreset(name: string, lineage: string[] = []): string[] {
	const preset = presets.get(name);
	assert.ok(preset, `unknown preset "${name}"`);
	assert.ok(
		!lineage.includes(name),
		`preset extends cycle: ${[...lineage, name].join(" -> ")}`,
	);
	const base = preset.extends
		? expandPreset(preset.extends, [...lineage, name])
		: [];
	const additions = preset.features.map((entry) =>
		entry.startsWith("+") ? entry.slice(1) : entry,
	);
	const merged = [...base, ...additions];
	const seen = new Set<string>();
	for (const feature of merged) {
		assert.ok(
			!seen.has(feature),
			`preset "${name}" lists feature "${feature}" more than once (already provided by "${preset.extends}" or repeated in "features")`,
		);
		seen.add(feature);
	}
	return merged;
}

// Precompute claim matchers and the file → feature owner map once.

const claimMatchers = new Map<
	string,
	Array<{ feature: string; glob: string; pattern: RegExp }>
>();
for (const [id, decl] of features) {
	claimMatchers.set(
		id,
		decl.claims.map((glob) => ({
			feature: id,
			glob,
			pattern: globToRegExp(glob),
		})),
	);
}

const allMatchableFiles = [
	...walk(path.join(REPO_ROOT, "apps/api/src")),
	...walk(path.join(REPO_ROOT, "apps/web/src/features")),
	...walk(path.join(REPO_ROOT, "packages/shared/src")),
];

const ownerOf = new Map<string, string>();
const claimHits = new Map<string, number>();
for (const relPath of allMatchableFiles) {
	const owners = [...claimMatchers.values()]
		.flat()
		.filter(({ pattern }) => pattern.test(relPath))
		.map(({ feature, glob }) => {
			claimHits.set(glob, (claimHits.get(glob) ?? 0) + 1);
			return feature;
		});
	if (owners.length === 1) {
		ownerOf.set(relPath, owners[0]);
	}
}

function allowedDependencies(feature: FeatureDecl): Set<string> {
	return new Set([
		feature.id,
		...feature.dependsOn,
		...(feature.softDependsOn ?? []),
	]);
}

const IMPORT_PATTERNS = [
	/\bfrom\s*["']([^"']+)["']/g,
	/\bimport\s*["']([^"']+)["']/g,
	/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
	/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function extractImportSpecifiers(source: string): string[] {
	const specifiers = new Set<string>();
	for (const pattern of IMPORT_PATTERNS) {
		for (const match of source.matchAll(pattern)) {
			specifiers.add(match[1]);
		}
	}
	return [...specifiers];
}

function resolveImport(fromRelPath: string, specifier: string): string | null {
	let base: string;
	if (specifier === "@workspace/shared") {
		base = SHARED_SRC;
	} else if (specifier.startsWith("@workspace/shared/")) {
		base = path.join(SHARED_SRC, specifier.slice("@workspace/shared/".length));
	} else if (specifier.startsWith("@api/")) {
		base = path.join(API_SRC, specifier.slice("@api/".length));
	} else if (specifier.startsWith("@/")) {
		base = path.join(WEB_SRC, specifier.slice(2));
	} else if (specifier.startsWith(".")) {
		base = path.resolve(
			path.dirname(path.join(REPO_ROOT, fromRelPath)),
			specifier,
		);
	} else {
		return null;
	}
	const candidates = [
		base,
		`${base}.ts`,
		`${base}.tsx`,
		`${base}/index.ts`,
		`${base}/index.tsx`,
		`${base.replace(/\.js$/, "")}.ts`,
	];
	for (const candidate of candidates) {
		if (isFile(candidate)) {
			return toRel(candidate);
		}
	}
	return null;
}

/**
 * Known boundary violations that survive Phase 1 (dependency inversion).
 *
 * Each entry is `[file, imported feature]`. Phase 2b removes the
 * composition-root entries (core/routes/admin, features/mcp/audit), Phase 4
 * the
 * infrastructure-template entries (platform/*, lib/redis/*) and Phase 5 the
 * web cross-feature entries. Everything here warns instead of failing —
 * anything not listed fails the suite, and listed entries that no longer
 * occur also fail (they must be removed when fixed).
 */
const KNOWN_VIOLATIONS: Array<[string, string]> = [
	// ---- Tier 3/4 surfaces reaching across without a declared edge ----
	["apps/api/src/core/routes/admin.ts", "billing"], // Phase 2b: module composition
	["apps/api/src/features/mcp/audit.ts", "ai"], // Phase 2b: route through a port
	// ---- core infrastructure aware of optional features ----
	["apps/api/src/core/lib/redis/rate-limit.ts", "ai"], // Phase 4: rate-limiter binding templating
	["apps/api/src/core/lib/redis/webhook-queue.ts", "webhooks"], // Phase 4: queue binding templating
	["apps/api/src/core/platform/cloudflare.ts", "webhooks"], // Phase 4: wrangler templating
	["apps/api/src/core/platform/shared.ts", "ai"], // Phase 4: env contract folding
	["apps/api/src/core/platform/shared.ts", "attachments"], // Phase 4: env contract folding
	["apps/api/src/core/platform/shared.ts", "billing"], // Phase 4: env contract folding
	["apps/api/src/core/platform/shared.ts", "mcp"], // Phase 4: env contract folding
	["apps/api/src/core/platform/types.ts", "ai"], // Phase 4: env contract folding
	["apps/api/src/core/platform/types.ts", "attachments"], // Phase 4: env contract folding
	["apps/api/src/core/platform/types.ts", "billing"], // Phase 4: env contract folding
	["apps/api/src/core/platform/types.ts", "mcp"], // Phase 4: env contract folding
	["apps/api/src/core/platform/types.ts", "webhooks"], // Phase 4: env contract folding
	// ---- web cross-feature data references (docs §9.4) ----
	["apps/web/src/features/activities/components/issue-activity.tsx", "labels"], // Phase 5: label dto in activity history
	["apps/web/src/features/cycles/data.ts", "issues"], // Phase 5
	["apps/web/src/features/issues/components/create-issue-dialog.tsx", "cycles"], // Phase 5
	[
		"apps/web/src/features/issues/components/create-issue-dialog.tsx",
		"templates",
	], // Phase 5
	[
		"apps/web/src/features/issues/components/issue-properties-panel.tsx",
		"cycles",
	], // Phase 5
	[
		"apps/web/src/features/issues/components/relations-section.tsx",
		"relations",
	], // Phase 5: relation dto types (cannot be declared: relations → issues)
	["apps/web/src/features/issues/data.ts", "favorites"], // Phase 5
	["apps/web/src/features/issues/use-view-detach.ts", "views"], // Phase 5
	["apps/web/src/features/labels/data.ts", "issues"], // Phase 5
	["apps/web/src/features/statuses/data.ts", "issues"], // Phase 5
];

function collectViolations(): Array<[string, string]> {
	const violations = new Set<string>();
	for (const [relPath, owner] of ownerOf) {
		if (BOUNDARY_EXEMPT_FILES.has(relPath)) continue;
		const feature = features.get(owner);
		assert.ok(feature, `owner feature "${owner}" missing for ${relPath}`);
		const allowed = allowedDependencies(feature);
		const source = readFileSync(path.join(REPO_ROOT, relPath), "utf8");
		for (const specifier of extractImportSpecifiers(source)) {
			const target = resolveImport(relPath, specifier);
			if (!target) continue;
			const targetOwner = ownerOf.get(target);
			if (!targetOwner || targetOwner === owner) continue;
			if (allowed.has(targetOwner)) continue;
			violations.add(JSON.stringify([relPath, targetOwner]));
		}
	}
	return [...violations]
		.map((entry) => JSON.parse(entry) as [string, string])
		.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
}

test("feature and preset declarations validate against the manifest schema", () => {
	assert.ok(
		features.size >= 25,
		`expected 25 features (issue-subscriptions merged into notifications), found ${features.size}`,
	);
	assert.ok(presets.size >= 6, `expected 6 presets, found ${presets.size}`);

	for (const [id, decl] of features) {
		const allEdges = [...decl.dependsOn, ...(decl.softDependsOn ?? [])];
		for (const dep of allEdges) {
			assert.ok(
				features.has(dep),
				`feature "${id}" depends on unknown feature "${dep}"`,
			);
			assert.notEqual(dep, id, `feature "${id}" depends on itself`);
		}
		for (const dep of decl.dependsOn) {
			const target = features.get(dep);
			assert.ok(target, `feature "${id}" depends on unknown feature "${dep}"`);
			assert.ok(
				target.tier <= decl.tier,
				`feature "${id}" (tier ${decl.tier}) hard-depends on "${dep}" (tier ${target.tier}) — dependencies must not point to a higher tier`,
			);
		}
	}

	// The hard-dependency graph must be acyclic: it drives the generation
	// topological order. Soft edges are deliberately excluded — a soft
	// back-edge is the declared way two features integrate optionally in
	// both directions (e.g. comments ~> attachments for DTO decoration while
	// attachments hard-depends on comments for its dao; comments ~>
	// notifications for the shared reaction constants while notifications ~>
	// comments for the author DTO). Hard closure stays a DAG either way.
	const visited = new Set<string>();
	const stack = new Set<string>();
	function visit(id: string) {
		if (stack.has(id)) {
			throw new Error(`dependency cycle: ${[...stack, id].join(" -> ")}`);
		}
		if (visited.has(id)) return;
		stack.add(id);
		const decl = features.get(id);
		assert.ok(decl, `unknown feature "${id}"`);
		for (const dep of decl.dependsOn) {
			visit(dep);
		}
		stack.delete(id);
		visited.add(id);
	}
	for (const id of features.keys()) {
		visit(id);
	}

	for (const name of presets.keys()) {
		const expanded = expandPreset(name);
		assert.ok(expanded.length > 0, `preset "${name}" expands to no features`);
		for (const featureId of expanded) {
			assert.ok(
				features.has(featureId),
				`preset "${name}" references unknown feature "${featureId}"`,
			);
		}
	}
});

test("every preset contains the hard-dependency closure of its members", () => {
	for (const name of presets.keys()) {
		const enabled = new Set(expandPreset(name));
		const missing: string[] = [];
		for (const featureId of enabled) {
			const decl = features.get(featureId);
			assert.ok(decl, `unknown feature "${featureId}"`);
			for (const dep of decl.dependsOn) {
				if (!enabled.has(dep)) {
					missing.push(`${dep} (required by ${featureId})`);
				}
			}
		}
		assert.deepEqual(
			missing,
			[],
			`preset "${name}" is missing hard dependencies:\n${missing.join("\n")}`,
		);
	}
});

test("every business source file is claimed by exactly one feature", () => {
	const unclaimed: string[] = [];
	const multiClaimed: string[] = [];
	for (const root of SCAN_ROOTS) {
		for (const relPath of walk(path.join(REPO_ROOT, root))) {
			if (isExempt(relPath)) continue;
			const owners = [...claimMatchers.values()]
				.flat()
				.filter(({ pattern }) => pattern.test(relPath))
				.map(({ feature }) => feature);
			if (owners.length === 0) {
				unclaimed.push(relPath);
			} else if (owners.length > 1) {
				multiClaimed.push(
					`${relPath} (${[...new Set(owners)].sort().join(", ")})`,
				);
			}
		}
	}
	assert.deepEqual(
		unclaimed,
		[],
		`files not claimed by any feature — add them to presets/features/<id>.json claims:\n${unclaimed.join("\n")}`,
	);
	assert.deepEqual(
		multiClaimed,
		[],
		`files claimed by multiple features:\n${multiClaimed.join("\n")}`,
	);

	const staleClaims: string[] = [];
	for (const { glob } of [...claimMatchers.values()].flat()) {
		if ((claimHits.get(glob) ?? 0) === 0) {
			staleClaims.push(glob);
		}
	}
	assert.deepEqual(
		staleClaims,
		[],
		`claim globs that match no existing file:\n${staleClaims.join("\n")}`,
	);
});

test("imports stay within the declared feature boundaries", () => {
	const violations = collectViolations();
	const known = new Map<string, Set<string>>();
	for (const [file, feature] of KNOWN_VIOLATIONS) {
		const targets = known.get(file) ?? new Set<string>();
		targets.add(feature);
		known.set(file, targets);
	}

	const unknown = violations.filter(
		([file, feature]) => !known.get(file)?.has(feature),
	);
	assert.deepEqual(
		unknown,
		[],
		`undocumented boundary violations (fix the import, declare the dependency, or extend KNOWN_VIOLATIONS):\n${unknown
			.map(([file, feature]) => `${file} -> ${feature}`)
			.join("\n")}`,
	);

	for (const [file, feature] of violations) {
		console.warn(
			`[architecture] known violation (tracked for a later phase): ${file} -> ${feature}`,
		);
	}

	// Stale entries fail: a warning-only check would let the list silently
	// drift away from reality. Remove entries whose violations are fixed.
	const observed = new Set(
		violations.map(([file, feature]) => `${file} -> ${feature}`),
	);
	const stale: string[] = [];
	for (const [file, feature] of KNOWN_VIOLATIONS) {
		if (!observed.has(`${file} -> ${feature}`)) {
			stale.push(`${file} -> ${feature}`);
		}
	}
	assert.deepEqual(
		stale,
		[],
		`KNOWN_VIOLATIONS entries whose violation no longer exists (remove them):\n${stale.join("\n")}`,
	);
});
