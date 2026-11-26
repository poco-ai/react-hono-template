import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { type CliOptions, parseCli } from "./cli";
import { copyTemplate, prepareOutDir } from "./copy";
import { generateBaselines, runOrThrow } from "./db-baseline";
import { log } from "./log";
import {
	customBaseFeatures,
	REPO_ROOT,
	resolveSelection,
	type SelectionInput,
} from "./manifest";
import { rewriteAggregators } from "./rewrite";
import { deleteTemplateOnlyFiles, trimClaims } from "./trim";
import { verifyOutput } from "./verify";

/** `[dir]` and `--out` are alternative spellings; only one may be given. */
function resolveOutDir(options: CliOptions): string {
	if (options.dir !== undefined && options.out !== undefined) {
		if (path.resolve(options.dir) !== path.resolve(options.out)) {
			throw new Error(
				`conflicting output directories: "${options.dir}" (positional) and "${options.out}" (--out) — pass only one`,
			);
		}
	}
	const target = options.out ?? options.dir;
	if (target === undefined) {
		throw new Error(
			"no output directory given — pass a positional [dir] or --out <dir> (an interactive directory prompt arrives in Phase 3)",
		);
	}
	return path.resolve(target);
}

/** `--preset` and `--features` are mutually exclusive selection inputs. */
function resolveSelectionInput(options: CliOptions): SelectionInput {
	if (options.preset !== undefined && options.features !== undefined) {
		throw new Error(
			"--preset and --features are mutually exclusive — pass exactly one",
		);
	}
	if (options.preset !== undefined) return { preset: options.preset };
	if (options.features !== undefined) return { features: options.features };
	throw new Error(
		"no selection given — pass --preset <name> or --features <ids> (an interactive selection prompt arrives in Phase 3)",
	);
}

function main(): void {
	const options = parseCli(process.argv);
	if (!options) return; // --help / --version: cac already printed the output.

	const selection = resolveSelection(resolveSelectionInput(options));
	const outDir = resolveOutDir(options);
	const realOutDir = existsSync(outDir) ? realpathSync(outDir) : outDir;
	const realRepo = realpathSync(REPO_ROOT);
	if (
		realOutDir === realRepo ||
		realOutDir.startsWith(`${realRepo}${path.sep}`)
	) {
		throw new Error("--out must be outside the template repository");
	}
	if (realOutDir === path.parse(realOutDir).root || realOutDir === homedir()) {
		throw new Error(`refusing to generate into "${realOutDir}"`);
	}
	if (existsSync(path.join(realOutDir, ".git"))) {
		throw new Error(
			`refusing to replace "${realOutDir}": it contains a .git directory`,
		);
	}

	if (selection.mode === "custom") {
		const base = new Set(customBaseFeatures());
		const added = selection.features.filter(
			(feature) => !base.has(feature.id),
		).length;
		log.step(
			`custom selection: minimal 基座 + ${added} 附加 → ${selection.features.length} features`,
		);
	} else {
		log.step(
			`preset "${selection.name}" expands to ${selection.features.length} features`,
		);
	}
	log.info(selection.features.map((feature) => feature.id).join(", "));

	log.step(`prepare ${outDir}`);
	prepareOutDir(outDir, options.force);

	log.step("copy template tree");
	const copied = copyTemplate(outDir);
	log.info(
		`${copied} paths copied (presets/, packages/create-app/, node_modules/, .git/ excluded)`,
	);

	log.step("trim claims of disabled features");
	const trimmed = trimClaims(outDir, selection);
	log.info(`${trimmed.deleted} files removed`);

	log.step("remove template-only files");
	const templateOnly = deleteTemplateOnlyFiles(outDir, selection);
	log.info(`${templateOnly} files removed`);

	log.step("rewrite aggregation files");
	rewriteAggregators(outDir, selection);
	log.info(
		"manifest.ts, routes.ts, registry.ts, i18n, shared index, schema exports, web-types, wrangler, .dev.vars.example, README, tests",
	);

	log.step("install workspace dependencies");
	runOrThrow("bun", ["install"], outDir, "bun install");

	// The generated project commits `routeTree.gen.ts`; always regenerate it
	// (not only under --verify) so the output typechecks out of the box.
	log.step("regenerate route tree");
	runOrThrow(
		"bunx",
		["vite", "build"],
		path.join(outDir, "apps/web"),
		"web vite build (route tree)",
	);

	log.step("regenerate database baselines");
	const baselines = generateBaselines(outDir, selection.enabled.has("search"));
	log.info(`sqlite: ${baselines.sqlite.join(", ")}`);
	log.info(`postgres: ${baselines.postgres.join(", ")}`);

	log.step("format generated files");
	runOrThrow(
		"bunx",
		["biome", "check", "--write", "."],
		outDir,
		"biome check --write",
	);

	if (options.verify) {
		log.step("self-check the generated project");
		verifyOutput(outDir);
		log.step("all verification steps passed");
	}

	log.step("done");
	log.info(`output: ${outDir}`);
	if (selection.mode === "custom") {
		log.info(`selection: custom (${selection.features.length} features)`);
	} else {
		log.info(
			`preset: ${selection.name} (${selection.features.length} features)`,
		);
	}
	if (!options.verify) {
		log.warn("run with --verify to execute the full quality gate");
	}
}

try {
	main();
} catch (error) {
	log.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
