import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { copyTemplate, prepareOutDir } from "./copy";
import { generateBaselines, runOrThrow } from "./db-baseline";
import { log } from "./log";
import { listPresets, REPO_ROOT, resolvePreset } from "./manifest";
import { rewriteAggregators } from "./rewrite";
import { deleteTemplateOnlyFiles, trimClaims } from "./trim";
import { verifyOutput } from "./verify";

type Options = {
	preset?: string;
	out?: string;
	verify: boolean;
	force: boolean;
	help: boolean;
};

function parseArgs(argv: string[]): Options {
	const options: Options = { verify: false, force: false, help: false };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			options.help = true;
		} else if (arg === "--verify") {
			options.verify = true;
		} else if (arg === "--force") {
			options.force = true;
		} else if (arg === "--preset" || arg === "-p") {
			options.preset = argv[++i];
		} else if (arg.startsWith("--preset=")) {
			options.preset = arg.slice("--preset=".length);
		} else if (arg === "--out" || arg === "-o") {
			options.out = argv[++i];
		} else if (arg.startsWith("--out=")) {
			options.out = arg.slice("--out=".length);
		} else {
			throw new Error(`unknown argument "${arg}"`);
		}
	}
	return options;
}

function usage(): string {
	return `Usage: bun run create-app --preset <${listPresets().join("|")}> --out <dir> [--verify] [--force]

  --preset, -p   preset name (${listPresets().join(", ")})
  --out, -o      output directory (empty or missing unless --force)
  --verify       run install + check + typecheck + build + test in the output
  --force        replace the contents of a non-empty output directory
`;
}

function main(): void {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(usage());
		return;
	}
	if (!options.preset) throw new Error(`--preset is required\n\n${usage()}`);
	if (!options.out) throw new Error(`--out is required\n\n${usage()}`);

	const preset = resolvePreset(options.preset);
	const outDir = path.resolve(options.out);
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

	log.step(
		`preset "${preset.name}" expands to ${preset.features.length} features`,
	);
	log.info(preset.features.map((feature) => feature.id).join(", "));

	log.step(`prepare ${outDir}`);
	prepareOutDir(outDir, options.force);

	log.step("copy template tree");
	const copied = copyTemplate(outDir);
	log.info(
		`${copied} paths copied (presets/, packages/create-app/, node_modules/, .git/ excluded)`,
	);

	log.step("trim claims of disabled features");
	const trimmed = trimClaims(outDir, preset);
	log.info(`${trimmed.deleted} files removed`);

	log.step("remove template-only files");
	const templateOnly = deleteTemplateOnlyFiles(outDir, preset);
	log.info(`${templateOnly} files removed`);

	log.step("rewrite aggregation files");
	rewriteAggregators(outDir, preset);
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
	const baselines = generateBaselines(outDir, preset.enabled.has("search"));
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
	log.info(`preset: ${preset.name} (${preset.features.length} features)`);
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
