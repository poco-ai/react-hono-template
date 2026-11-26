import * as p from "@clack/prompts";
import {
	customBaseFeatures,
	getPreset,
	listFeatures,
	listPresets,
	resolveSelection,
	type SelectionInput,
} from "./manifest";

/**
 * The interactive prompt layer. `collectMissingInput` only asks for what
 * the flags did not provide, and every prompt result is checked with
 * `isCancel` so a Ctrl+C exits before any filesystem write happens.
 *
 * The `PromptUi` seam exists so tests can drive the flow with a scripted
 * fake; `clackUi` is the real @clack/prompts adapter.
 */

export type SelectOption = {
	value: string;
	label?: string;
	hint?: string;
};

export type PromptUi = {
	intro: (title: string) => void;
	outro: (message: string) => void;
	text: (opts: {
		message: string;
		placeholder?: string;
		validate?: (value: string | undefined) => string | undefined;
	}) => Promise<string | symbol>;
	select: (opts: {
		message: string;
		options: SelectOption[];
	}) => Promise<string | symbol>;
	multiselect: (opts: {
		message: string;
		options: SelectOption[];
		required?: boolean;
	}) => Promise<string[] | symbol>;
	confirm: (opts: { message: string }) => Promise<boolean | symbol>;
	note: (message: string, title?: string) => void;
	cancel: (message?: string) => void;
	/** Narrows prompt results after a Ctrl+C (clack's CANCEL_SYMBOL). */
	isCancel: (value: unknown) => value is symbol;
};

export const clackUi: PromptUi = {
	intro: (title) => p.intro(title),
	outro: (message) => p.outro(message),
	text: (opts) => p.text(opts),
	select: (opts) => p.select<string>(opts),
	multiselect: (opts) => p.multiselect<string>({ required: false, ...opts }),
	confirm: (opts) => p.confirm({ active: "Yes", inactive: "No", ...opts }),
	note: (message, title) => p.note(message, title),
	cancel: (message) => p.cancel(message),
	isCancel: (value) => p.isCancel(value),
};

/** Coarse tier names shown as option hints in the feature picker. */
const TIER_LABELS: Record<number, string> = {
	0: "Core",
	1: "Workspace",
	2: "Collaboration",
	3: "Commercial",
	4: "Intelligence",
};

/** Preset quick-starts ordered small to large, plus the custom entry. */
function startOptions(): SelectOption[] {
	const presets = listPresets().map((name) => {
		const decl = getPreset(name);
		const count = resolveSelection({ preset: name }).features.length;
		return {
			value: name,
			label: `${decl.label ?? name} · ${count} features`,
			hint: decl.description,
			count,
		};
	});
	presets.sort((a, b) => a.count - b.count || a.value.localeCompare(b.value));
	return [
		...presets.map(({ count, ...option }) => option),
		{
			value: "custom",
			label: "Custom · pick features yourself",
			hint: "minimal base plus the features you select",
		},
	];
}

/** Feature picker options: everything outside the locked minimal base. */
function extraFeatureOptions(): (SelectOption & { tier: number })[] {
	const base = new Set(customBaseFeatures());
	return listFeatures()
		.filter((feature) => !base.has(feature.id))
		.map((feature) => ({
			value: feature.id,
			label: feature.label ?? feature.id,
			hint: feature.description
				? `${TIER_LABELS[feature.tier] ?? "Feature"} — ${feature.description}`
				: TIER_LABELS[feature.tier],
			tier: feature.tier,
		}))
		.sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label));
}

export type PromptRequest = {
	dir?: string;
	preset?: string;
	features?: string[];
};

export type PromptResult =
	| { status: "cancelled" }
	| {
			status: "ready";
			dir: string;
			selection: SelectionInput;
			/** Raw `--features` values (used to render auto-included deps). */
			requestedFeatures: string[] | null;
	  };

export async function collectMissingInput(
	request: PromptRequest,
	ui: PromptUi,
): Promise<PromptResult> {
	let dir = request.dir;
	if (dir === undefined) {
		const answer = await ui.text({
			message: "Where should the project be created?",
			placeholder: "./my-app",
			validate: (value) =>
				value === undefined || value.trim().length === 0
					? "Enter a directory path"
					: undefined,
		});
		if (ui.isCancel(answer)) return { status: "cancelled" };
		dir = answer.trim();
	}

	let selection: SelectionInput | undefined =
		request.preset !== undefined
			? { preset: request.preset }
			: request.features !== undefined
				? { features: request.features }
				: undefined;

	if (selection === undefined) {
		const choice = await ui.select({
			message: "How do you want to start?",
			options: startOptions(),
		});
		if (ui.isCancel(choice)) return { status: "cancelled" };
		if (choice === "custom") {
			const base = customBaseFeatures()
				.map((id) => {
					const feature = listFeatures().find((entry) => entry.id === id);
					return feature?.label ?? id;
				})
				.join(", ");
			ui.note(base, "Minimal base — always included");
			const extras = await ui.multiselect({
				message: "Pick additional features",
				options: extraFeatureOptions(),
				required: false,
			});
			if (ui.isCancel(extras)) return { status: "cancelled" };
			selection = { features: extras };
		} else {
			selection = { preset: choice };
		}
	}

	return {
		status: "ready",
		dir,
		selection,
		requestedFeatures: "features" in selection ? selection.features : null,
	};
}

/** Compact pre-flight summary shown before the destructive confirm. */
export function buildSummary(
	requestedFeatures: string[] | null,
	summary: {
		name: string;
		mode: "preset" | "custom";
		features: { id: string; label?: string }[];
	},
	outDir: string,
): string {
	const count = summary.features.length;
	if (summary.mode === "custom") {
		const base = new Set(customBaseFeatures());
		const extras = summary.features.filter((feature) => !base.has(feature.id));
		const requested = new Set(requestedFeatures ?? []);
		const auto = extras.filter((feature) => !requested.has(feature.id));
		const lines = [
			`Custom selection — ${count} features`,
			`Minimal base: ${count - extras.length} features`,
			`Extras: ${extras.map((f) => f.id).join(", ") || "none"}`,
		];
		if (auto.length > 0) {
			lines.push(
				`Auto-included dependencies: ${auto.map((f) => f.id).join(", ")}`,
			);
		}
		lines.push(`Output: ${outDir}`);
		return lines.join("\n");
	}
	return [
		`Preset "${summary.name}" — ${count} features`,
		`Output: ${outDir}`,
	].join("\n");
}
