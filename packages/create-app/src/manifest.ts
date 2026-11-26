import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	type FeatureDecl,
	featureDeclSchema,
	type PresetDecl,
	presetDeclSchema,
} from "../../../presets/schema";

export const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../..",
);

const PRESETS_ROOT = path.join(REPO_ROOT, "presets");

export type ResolvedSelection = {
	name: string;
	/** Selection mode: a named preset, or an explicit custom feature list. */
	mode: "preset" | "custom";
	decl: PresetDecl;
	/** Feature declarations in selection order (enabled features only). */
	features: FeatureDecl[];
	/** Every declared feature, enabled or not. */
	allFeatures: FeatureDecl[];
	enabled: Set<string>;
};

/** Selection input: a named preset, or an explicit custom feature list. */
export type SelectionInput = { preset: string } | { features: string[] };

/**
 * The custom-selection base: `--features <ids>` always generates
 * minimal ∪ extras, so every custom project keeps the baseline shell.
 */
const CUSTOM_BASE_PRESET = "minimal";

/**
 * Docs every custom-generated project keeps, regardless of the selection.
 * Deliberately a superset of the minimal preset's declared `docs`: env vars
 * and architecture describe the platform foundation every selection shares,
 * so they stay useful even when features are trimmed.
 */
const BASE_DOCS = [
	"README.md",
	"docs/本地开发.md",
	"docs/部署.md",
	"docs/环境变量.md",
	"docs/架构.md",
];

function loadJsonDir(relativeDir: string): Map<string, unknown> {
	const dir = path.join(PRESETS_ROOT, relativeDir);
	const loaded = new Map<string, unknown>();
	for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
		a.name.localeCompare(b.name),
	)) {
		if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
		const stem = entry.name.slice(0, -".json".length);
		loaded.set(
			stem,
			JSON.parse(readFileSync(path.join(dir, entry.name), "utf8")),
		);
	}
	return loaded;
}

const featureDecls = new Map<string, FeatureDecl>();
for (const [stem, data] of loadJsonDir("features")) {
	const decl = featureDeclSchema.parse(data);
	if (decl.id !== stem) {
		throw new Error(`presets/features/${stem}.json declares id "${decl.id}"`);
	}
	featureDecls.set(decl.id, decl);
}

const presetDecls = new Map<string, PresetDecl>();
for (const [stem, data] of loadJsonDir("presets")) {
	const decl = presetDeclSchema.parse(data);
	if (decl.name !== stem) {
		throw new Error(
			`presets/presets/${stem}.json declares name "${decl.name}"`,
		);
	}
	presetDecls.set(decl.name, decl);
}

export function listPresets(): string[] {
	return [...presetDecls.keys()].sort();
}

export function listFeatures(): FeatureDecl[] {
	return [...featureDecls.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getFeature(id: string): FeatureDecl {
	const decl = featureDecls.get(id);
	if (!decl) throw new Error(`unknown feature "${id}"`);
	return decl;
}

/** Preset declaration by name (display metadata, extends, docs). */
export function getPreset(name: string): PresetDecl {
	const decl = presetDecls.get(name);
	if (!decl) throw new Error(`unknown preset "${name}"`);
	return decl;
}

function expandPreset(name: string, lineage: string[] = []): string[] {
	const preset = presetDecls.get(name);
	if (!preset) throw new Error(`unknown preset "${name}"`);
	if (lineage.includes(name)) {
		throw new Error(`preset extends cycle: ${[...lineage, name].join(" -> ")}`);
	}
	const base = preset.extends
		? expandPreset(preset.extends, [...lineage, name])
		: [];
	const additions = preset.features.map((entry) =>
		entry.startsWith("+") ? entry.slice(1) : entry,
	);
	const merged = [...base, ...additions];
	const seen = new Set<string>();
	for (const id of merged) {
		if (seen.has(id)) {
			throw new Error(
				`preset "${name}" lists feature "${id}" more than once (already provided by "${preset.extends}" or repeated in "features")`,
			);
		}
		seen.add(id);
	}
	return merged;
}

/** Docs lists inherit through `extends` (a child's list replaces the parent's). */
function effectiveDocs(name: string, lineage: string[] = []): string[] {
	const preset = presetDecls.get(name);
	if (!preset) return [];
	if (lineage.includes(name)) return [];
	const inherited = preset.extends
		? effectiveDocs(preset.extends, [...lineage, name])
		: [];
	return preset.docs ?? inherited;
}

function resolvePresetSelection(name: string): ResolvedSelection {
	const decl = presetDecls.get(name);
	if (!decl) {
		throw new Error(
			`unknown preset "${name}" (available: ${listPresets().join(", ")})`,
		);
	}
	const order = expandPreset(name);
	for (const id of order) {
		if (!featureDecls.has(id)) {
			throw new Error(`preset "${name}" references unknown feature "${id}"`);
		}
	}
	const enabled = new Set(order);
	const missing: string[] = [];
	for (const id of order) {
		const feature = getFeature(id);
		for (const dep of feature.dependsOn) {
			if (!enabled.has(dep)) missing.push(`${dep} (required by ${id})`);
		}
	}
	if (missing.length > 0) {
		throw new Error(
			`preset "${name}" is missing hard dependencies:\n${missing.join("\n")}`,
		);
	}
	const docs = effectiveDocs(name);
	// A preset's docs list must not reference documents owned by a feature
	// the preset disables: trim deletes feature-owned docs, so the preset
	// docs entry would silently describe a file missing from the output.
	const docsOwnedByDisabled = new Map<string, string>();
	for (const feature of listFeatures()) {
		if (enabled.has(feature.id)) continue;
		for (const claim of feature.claims) {
			if (claim.endsWith(".md") && !claim.startsWith("apps/")) {
				docsOwnedByDisabled.set(claim, feature.id);
			}
		}
	}
	const conflictingDocs = docs.filter((doc) => docsOwnedByDisabled.has(doc));
	if (conflictingDocs.length > 0) {
		throw new Error(
			`preset "${name}" lists docs owned by disabled features:\n${conflictingDocs
				.map((doc) => `${doc} (owned by ${docsOwnedByDisabled.get(doc)})`)
				.join("\n")}`,
		);
	}
	return {
		name,
		mode: "preset",
		decl: { ...decl, docs },
		features: order.map((id) => getFeature(id)),
		allFeatures: listFeatures(),
		enabled,
	};
}

/** Feature ids of the custom-selection base (the minimal preset expansion). */
export function customBaseFeatures(): string[] {
	return expandPreset(CUSTOM_BASE_PRESET);
}

/**
 * Docs a custom selection keeps: the base set plus .md files claimed by
 * enabled features (ai claims docs/AI与MCP.md).
 */
export function deriveDocs(enabled: Set<string>): string[] {
	const docs = new Set<string>(BASE_DOCS);
	for (const id of enabled) {
		for (const claim of getFeature(id).claims) {
			if (claim.endsWith(".md") && !claim.startsWith("apps/")) docs.add(claim);
		}
	}
	return [...docs];
}

function resolveCustomSelection(requested: string[]): ResolvedSelection {
	const available = listFeatures().map((feature) => feature.id);
	const seen = new Set<string>();
	for (const id of requested) {
		if (seen.has(id)) {
			throw new Error(
				`duplicate feature "${id}" in --features (available: ${available.join(", ")})`,
			);
		}
		seen.add(id);
		if (!featureDecls.has(id)) {
			throw new Error(
				`unknown feature "${id}" (available: ${available.join(", ")})`,
			);
		}
	}

	// Base lock: a custom selection is always minimal ∪ extras.
	const order = [...customBaseFeatures()];
	const enabled = new Set(order);
	const add = (id: string): void => {
		if (enabled.has(id)) return;
		enabled.add(id);
		order.push(id);
	};
	for (const id of requested) add(id);

	// Hard-dependency closure: merge dependsOn until nothing new appears.
	let changed = true;
	while (changed) {
		changed = false;
		for (const id of [...enabled]) {
			for (const dep of getFeature(id).dependsOn) {
				if (enabled.has(dep)) continue;
				add(dep);
				changed = true;
			}
		}
	}

	return {
		name: "custom",
		mode: "custom",
		decl: {
			name: "custom",
			features: order,
			docs: deriveDocs(enabled),
		},
		features: order.map((id) => getFeature(id)),
		allFeatures: listFeatures(),
		enabled,
	};
}

export function resolveSelection(input: SelectionInput): ResolvedSelection {
	return "preset" in input
		? resolvePresetSelection(input.preset)
		: resolveCustomSelection(input.features);
}

export function isEnabled(selection: ResolvedSelection, id: string): boolean {
	return selection.enabled.has(id);
}
