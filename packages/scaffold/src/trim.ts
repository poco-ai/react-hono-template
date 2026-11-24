import { existsSync, readdirSync, rmdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { globToRegExp } from "./glob";
import type { ResolvedPreset } from "./manifest";
import { featureMeta } from "./meta";

/** Skeleton directories that survive even when every claim below them is gone. */
const KEEP_DIRS = new Set([
	"apps/api/src/features",
	"apps/web/src/features",
	"apps/api/src",
	"apps/web/src",
	"apps/api",
	"apps/web",
	"apps",
	"packages",
	"packages/shared",
	"packages/ui",
	"packages/shared/src",
]);

function walkFiles(root: string, relativeDir = ""): string[] {
	const absoluteDir = relativeDir ? path.join(root, relativeDir) : root;
	const files: string[] = [];
	for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
		const relativePath = relativeDir
			? `${relativeDir}/${entry.name}`
			: entry.name;
		if (entry.isDirectory()) {
			files.push(...walkFiles(root, relativePath));
		} else if (entry.isFile() || entry.isSymbolicLink()) {
			files.push(relativePath);
		}
	}
	return files;
}

export function disabledClaimPatterns(preset: ResolvedPreset): RegExp[] {
	const patterns: RegExp[] = [];
	for (const feature of preset.allFeatures) {
		if (preset.enabled.has(feature.id)) continue;
		for (const claim of feature.claims) {
			patterns.push(globToRegExp(claim));
		}
	}
	return patterns;
}

function pruneEmptyDirs(root: string, relativeDir = ""): void {
	const absoluteDir = relativeDir ? path.join(root, relativeDir) : root;
	for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const relativePath = relativeDir
			? `${relativeDir}/${entry.name}`
			: entry.name;
		pruneEmptyDirs(root, relativePath);
	}
	if (!relativeDir || KEEP_DIRS.has(relativeDir)) return;
	if (relativeDir.split("/").some((segment) => segment === ".git")) return;
	const remaining = readdirSync(absoluteDir);
	if (remaining.length === 0) rmdirSync(absoluteDir);
}

export type TrimResult = {
	deleted: number;
};

export function trimClaims(outDir: string, preset: ResolvedPreset): TrimResult {
	const patterns = disabledClaimPatterns(preset);
	// Enabled claims must never overlap a disabled claim: that would delete a
	// file an enabled feature still needs (compile failure at best, silently
	// missing code at worst). The architecture test already forbids overlap in
	// the template; this guards the generator itself.
	const enabledPatterns: RegExp[] = [];
	for (const feature of preset.allFeatures) {
		if (!preset.enabled.has(feature.id)) continue;
		for (const claim of feature.claims) {
			enabledPatterns.push(globToRegExp(claim));
		}
	}
	const disabled = preset.features
		.filter((feature) => !preset.enabled.has(feature.id))
		.map((feature) => feature.id);
	const files = walkFiles(outDir);
	let deleted = 0;
	for (const relativePath of files) {
		if (!patterns.some((pattern) => pattern.test(relativePath))) continue;
		if (enabledPatterns.some((pattern) => pattern.test(relativePath))) {
			throw new Error(
				`claim overlap: "${relativePath}" is owned by both an enabled and a disabled feature`,
			);
		}
		rmSync(path.join(outDir, relativePath), { force: true });
		deleted++;
	}

	// Docs are claimed per feature too (ai owns docs/AI与MCP.md).
	for (const id of disabled) {
		for (const doc of featureMeta(id).docs) {
			const absolute = path.join(outDir, doc);
			if (existsSync(absolute) && statSync(absolute).isFile()) {
				rmSync(absolute, { force: true });
				deleted++;
			}
		}
	}

	pruneEmptyDirs(outDir);
	return { deleted };
}

/**
 * Template-only paths that no preset keeps. Runs before the per-feature test
 * scan so the remaining tests are the ones that can still apply.
 */
export function deleteTemplateOnlyFiles(
	outDir: string,
	preset: ResolvedPreset,
): number {
	const always = [
		"docs/模板化重构方案.md",
		".github/workflows/preset-matrix.yml",
		".github/workflows/configure-ai.yml",
		"apps/api/tests/architecture.test.ts",
		"apps/api/tests/compose-order.test.ts",
		"apps/api/tests/route-contributions.test.ts",
		"apps/web/tests/web-registry.test.ts",
	];
	const aiDisabled = ["apps/api/tests/search-fts.test.ts"];
	let deleted = 0;
	for (const relativePath of always) {
		const absolute = path.join(outDir, relativePath);
		if (existsSync(absolute)) {
			rmSync(absolute, { force: true });
			deleted++;
		}
	}
	if (!preset.enabled.has("search")) {
		const absolute = path.join(outDir, aiDisabled[1]);
		if (existsSync(absolute)) {
			rmSync(absolute, { force: true });
			deleted++;
		}
		for (const relativePath of [
			"apps/api/drizzle/fts",
			"apps/api/drizzle-pg/fts",
		]) {
			rmSync(path.join(outDir, relativePath), { recursive: true, force: true });
		}
	}
	// Docs subset: keep only the docs the preset declares (README is root-level).
	const allowed = new Set(preset.decl.docs ?? []);
	const docsDir = path.join(outDir, "docs");
	if (existsSync(docsDir)) {
		for (const entry of readdirSync(docsDir, { withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const relativePath = `docs/${entry.name}`;
			if (allowed.has(relativePath)) continue;
			rmSync(path.join(outDir, relativePath), { force: true });
			deleted++;
		}
	}
	return deleted;
}
