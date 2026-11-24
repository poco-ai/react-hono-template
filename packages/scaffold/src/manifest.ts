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

export type ResolvedPreset = {
	name: string;
	decl: PresetDecl;
	/** Feature declarations in preset-expansion order (enabled features only). */
	features: FeatureDecl[];
	/** Every declared feature, enabled or not. */
	allFeatures: FeatureDecl[];
	enabled: Set<string>;
};

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

export function resolvePreset(name: string): ResolvedPreset {
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
	return {
		name,
		decl,
		features: order.map((id) => getFeature(id)),
		allFeatures: listFeatures(),
		enabled,
	};
}

export function isEnabled(preset: ResolvedPreset, id: string): boolean {
	return preset.enabled.has(id);
}
