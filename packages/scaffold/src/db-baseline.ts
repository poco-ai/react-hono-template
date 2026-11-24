import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
} from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./manifest";

export type CommandResult = {
	status: number;
	stdout: string;
	stderr: string;
};

export function run(
	command: string,
	args: string[],
	cwd: string,
): CommandResult {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, CI: "1" },
		maxBuffer: 32 * 1024 * 1024,
	});
	return {
		status: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

export function runOrThrow(
	command: string,
	args: string[],
	cwd: string,
	label: string,
): CommandResult {
	const result = run(command, args, cwd);
	if (result.status !== 0) {
		throw new Error(
			`${label} failed (exit ${result.status})\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`,
		);
	}
	return result;
}

function clearMigrations(directory: string, keep: string): void {
	if (!existsSync(directory)) return;
	for (const entry of readdirSync(directory)) {
		if (entry === keep) continue;
		rmSync(path.join(directory, entry), { recursive: true, force: true });
	}
}

function migrationTimestamps(directory: string): number[] {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name))
		.map((entry) => Number(entry.name.slice(0, 14)))
		.filter((value) => Number.isFinite(value));
}

function formatTimestamp(value: number): string {
	return String(value).padStart(14, "0");
}

function noSchemaChanges(label: string, result: CommandResult): void {
	const output = `${result.stdout}\n${result.stderr}`;
	if (!/no schema changes/i.test(output)) {
		throw new Error(`${label} was not a no-op after the baseline:\n${output}`);
	}
}

const FTS_SOURCE = path.join(
	REPO_ROOT,
	"apps/api/drizzle/20261124084722_search_fts/migration.sql",
);

/** Regenerates both dialect baselines and appends the hand-written FTS DDL. */
export function generateBaselines(
	outDir: string,
	searchEnabled: boolean,
): { sqlite: string[]; postgres: string[] } {
	const apiDir = path.join(outDir, "apps/api");
	const sqliteDir = path.join(apiDir, "drizzle");
	const pgDir = path.join(apiDir, "drizzle-pg");
	clearMigrations(sqliteDir, "fts");
	clearMigrations(pgDir, "fts");

	runOrThrow("bun", ["run", "db:generate"], apiDir, "db:generate (sqlite)");
	runOrThrow("bun", ["run", "db:generate:pg"], apiDir, "db:generate:pg");

	const sqliteTimestamps = migrationTimestamps(sqliteDir);
	if (sqliteTimestamps.length === 0) {
		throw new Error("db:generate produced no sqlite baseline folder");
	}

	if (searchEnabled) {
		const ftsTimestamp = formatTimestamp(Math.max(...sqliteTimestamps) + 1);
		const ftsDir = path.join(sqliteDir, `${ftsTimestamp}_search_fts`);
		mkdirSync(ftsDir, { recursive: true });
		copyFileSync(FTS_SOURCE, path.join(ftsDir, "migration.sql"));
	}

	const secondSqlite = run("bun", ["run", "db:generate"], apiDir);
	noSchemaChanges("second db:generate", secondSqlite);
	const secondPg = run("bun", ["run", "db:generate:pg"], apiDir);
	noSchemaChanges("second db:generate:pg", secondPg);

	return {
		sqlite: readdirSync(sqliteDir).sort(),
		postgres: readdirSync(pgDir).sort(),
	};
}
