import { readFileSync } from "node:fs";
import path from "node:path";
import { type CAC, cac } from "cac";
import { listPresets, REPO_ROOT } from "./manifest";

export type CliOptions = {
	/** Positional `[dir]`: the output directory. */
	dir?: string;
	out?: string;
	preset?: string;
	features?: string[];
	verify: boolean;
	force: boolean;
};

/** The create-app package version, printed by `--version`. */
function packageVersion(): string {
	const manifest = JSON.parse(
		readFileSync(
			path.join(REPO_ROOT, "packages/create-app/package.json"),
			"utf8",
		),
	) as { version?: string };
	return manifest.version ?? "0.0.0";
}

/**
 * The cac CLI definition. Phase 2 stays non-interactive: the output
 * directory and the preset/custom selection must arrive as flags. Phase 3
 * reuses this definition to drive the interactive prompts.
 */
export function createCli(): CAC {
	const cli = cac("create-app");
	cli
		.command("[dir]", "generate a project trimmed from this template")
		.usage("[dir] [options]")
		.option(
			"-o, --out <dir>",
			"output directory (empty or missing unless --force)",
		)
		.option("-p, --preset <name>", `preset name (${listPresets().join(", ")})`)
		.option(
			"--features <ids>",
			"comma-separated feature ids, a custom selection on the minimal base",
		)
		.option(
			"--verify",
			"run install + check + typecheck + build + test in the output",
		)
		.option("--force", "replace the contents of a non-empty output directory");
	cli.help((sections) =>
		// The only command is the default one, so cac's "Commands" and
		// "For more info" sections would just repeat the usage line.
		sections.filter(
			(section) =>
				section.title !== "Commands" &&
				!section.title?.startsWith("For more info"),
		),
	);
	cli.version(packageVersion());
	return cli;
}

function positionalDir(args: readonly string[]): string | undefined {
	const dir = args[0];
	return typeof dir === "string" ? dir : undefined;
}

function stringValue(value: unknown, flag: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string") return value;
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	throw new Error(
		`${flag} expects a single value, got ${JSON.stringify(value)}`,
	);
}

function featuresValue(value: unknown): string[] | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string") {
		return value.split(",").map((entry) => entry.trim());
	}
	throw new Error(
		`--features expects a comma-separated list, got ${JSON.stringify(value)}`,
	);
}

/**
 * Parses a `process.argv`-style array (bin, script, ...args).
 * Returns null when cac already printed the `--help` / `--version` output.
 */
export function parseCli(processArgv: string[]): CliOptions | null {
	const cli = createCli();
	const parsed = cli.parse(processArgv, { run: false });
	if (parsed.options.help || parsed.options.h) return null;
	if (parsed.options.version || parsed.options.v) return null;

	const command = cli.matchedCommand;
	if (command) {
		// The same guards cac would run before a command action: unknown
		// flags, missing option values and extra positionals all fail here.
		command.checkUnknownOptions();
		command.checkOptionValue();
		command.checkUnusedArgs();
	}

	const options = parsed.options as Record<string, unknown>;
	return {
		dir: positionalDir(parsed.args),
		out: stringValue(options.out, "--out"),
		preset: stringValue(options.preset, "--preset"),
		features: featuresValue(options.features),
		verify: options.verify === true,
		force: options.force === true,
	};
}
