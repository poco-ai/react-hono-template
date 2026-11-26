import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { type CliOptions, packageVersion, parseCli } from "./cli";
import { generate } from "./generate";
import { log } from "./log";
import { REPO_ROOT, resolveSelection, type SelectionInput } from "./manifest";
import {
	buildSummary,
	clackUi,
	collectMissingInput,
	type PromptUi,
} from "./prompt";

/** Interactive when the flags left something unanswered and stdin is a TTY. */
function isInteractive(options: CliOptions): boolean {
	if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
		return false;
	}
	return (
		options.dir === undefined ||
		(options.preset === undefined && options.features === undefined)
	);
}

/** `[dir]` and `--out` are alternative spellings; only one may be given. */
function resolveOutDir(
	dir: string | undefined,
	out: string | undefined,
): string {
	if (dir !== undefined && out !== undefined) {
		if (path.resolve(dir) !== path.resolve(out)) {
			throw new Error(
				`conflicting output directories: "${dir}" (positional) and "${out}" (--out) — pass only one`,
			);
		}
	}
	const target = out ?? dir;
	if (target === undefined) {
		throw new Error(
			"no output directory given — pass a positional [dir] or --out <dir>, or run create-app in a TTY to be prompted",
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
		"no selection given — pass --preset <name> or --features <ids>, or run create-app in a TTY to be prompted",
	);
}

/** Guards shared by both modes; runs before any filesystem write. */
function assertSafeOutDir(outDir: string): void {
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
}

function outroMessage(outDir: string): string {
	const relOut = path.relative(process.cwd(), outDir) || ".";
	const shown = relOut.startsWith("..") ? outDir : relOut;
	return [
		`Project ready in ${shown}`,
		"",
		"Next steps:",
		`  cd ${shown}`,
		"  cp apps/api/.dev.vars.example apps/api/.dev.vars",
		"  bun run dev",
		"",
		"Selection saved to .create-app.json — see docs/本地开发.md",
	].join("\n");
}

async function runInteractive(
	options: CliOptions,
	ui: PromptUi,
): Promise<void> {
	ui.intro(`create-react-hono-app v${packageVersion()}`);

	const collected = await collectMissingInput(options, ui);
	if (collected.status === "cancelled") {
		ui.cancel("Generation cancelled — nothing was written.");
		return;
	}

	const outDir = resolveOutDir(collected.dir, options.out);
	const selection = resolveSelection(collected.selection);
	assertSafeOutDir(outDir);

	ui.note(
		buildSummary(collected.requestedFeatures, selection, outDir),
		"Ready to generate",
	);
	const confirmed = await ui.confirm({ message: "Generate the project?" });
	if (ui.isCancel(confirmed) || !confirmed) {
		ui.cancel("Generation cancelled — nothing was written.");
		return;
	}

	await generate({
		outDir,
		selection,
		force: options.force,
		verify: options.verify,
	});
	ui.outro(outroMessage(outDir));
}

function runHeadless(options: CliOptions): Promise<void> {
	const selection = resolveSelection(resolveSelectionInput(options));
	const outDir = resolveOutDir(options.dir, options.out);
	assertSafeOutDir(outDir);
	return generate({
		outDir,
		selection,
		force: options.force,
		verify: options.verify,
	});
}

async function main(): Promise<void> {
	const options = parseCli(process.argv);
	if (!options) return; // --help / --version: cac already printed the output.
	if (isInteractive(options)) {
		await runInteractive(options, clackUi);
	} else {
		await runHeadless(options);
	}
}

try {
	await main();
} catch (error) {
	log.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
