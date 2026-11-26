import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { packageVersion } from "./cli";
import { copyTemplate, prepareOutDir } from "./copy";
import { generateBaselines, runOrThrow } from "./db-baseline";
import { log } from "./log";
import {
	customBaseFeatures,
	REPO_ROOT,
	type ResolvedSelection,
} from "./manifest";
import { rewriteAggregators } from "./rewrite";
import { deleteTemplateOnlyFiles, trimClaims } from "./trim";
import { verifyOutput } from "./verify";

export type GenerateArgs = {
	outDir: string;
	selection: ResolvedSelection;
	force: boolean;
	verify: boolean;
};

/** Short commit of the template repository, for `.create-app.json`. */
function templateCommit(): string | null {
	try {
		return execSync("git rev-parse --short HEAD", {
			cwd: REPO_ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

/**
 * Records what was generated, so a project can later diff itself against
 * the template commit it came from (the future upgrade path).
 */
function writeSelectionManifest(
	outDir: string,
	selection: ResolvedSelection,
): void {
	const manifest: Record<string, unknown> = {
		generator: "create-react-hono-app",
		templateVersion: packageVersion(),
		templateCommit: templateCommit(),
		mode: selection.mode,
		features: selection.features.map((feature) => feature.id),
		generatedAt: new Date().toISOString(),
	};
	if (selection.mode === "preset") {
		manifest.preset = selection.name;
	} else {
		manifest.base = "minimal";
	}
	writeFileSync(
		path.join(outDir, ".create-app.json"),
		`${JSON.stringify(manifest, null, "\t")}\n`,
	);
}

export async function generate(args: GenerateArgs): Promise<void> {
	const { outDir, selection } = args;

	if (selection.mode === "custom") {
		const base = new Set(customBaseFeatures());
		const added = selection.features.filter(
			(feature) => !base.has(feature.id),
		).length;
		log.step(
			`custom selection: minimal base + ${added} extras → ${selection.features.length} features`,
		);
	} else {
		log.step(
			`preset "${selection.name}" expands to ${selection.features.length} features`,
		);
	}
	log.info(selection.features.map((feature) => feature.id).join(", "));

	log.step(`prepare ${outDir}`);
	prepareOutDir(outDir, args.force);

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

	log.step("record selection manifest");
	writeSelectionManifest(outDir, selection);

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

	if (args.verify) {
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
	if (!args.verify) {
		log.warn("run with --verify to execute the full quality gate");
	}
}
