import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./manifest";

const EXCLUDED_SEGMENTS = new Set([
	".git",
	"node_modules",
	".turbo",
	".wrangler",
	"coverage",
	"dist",
	".DS_Store",
]);

const EXCLUDED_ROOT_DIRS = new Set(["presets"]);
const EXCLUDED_PREFIXES = ["packages/create-app"];
const EXCLUDED_FILES = [".dev.vars", ".env"];

export function prepareOutDir(outDir: string, force: boolean): void {
	if (existsSync(outDir)) {
		const entries = readdirSync(outDir);
		if (entries.length > 0) {
			if (!force) {
				throw new Error(
					`output directory "${outDir}" is not empty (use --force to replace its contents)`,
				);
			}
			for (const entry of entries) {
				rmSync(path.join(outDir, entry), { recursive: true, force: true });
			}
		}
	} else {
		mkdirSync(outDir, { recursive: true });
	}
}

function shouldCopy(relativePath: string): boolean {
	const segments = relativePath.split("/");
	if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) return false;
	if (EXCLUDED_ROOT_DIRS.has(segments[0])) return false;
	for (const prefix of EXCLUDED_PREFIXES) {
		if (relativePath === prefix || relativePath.startsWith(`${prefix}/`)) {
			return false;
		}
	}
	const fileName = segments[segments.length - 1] ?? "";
	if (EXCLUDED_FILES.includes(fileName)) return false;
	if (fileName.endsWith(".log")) return false;
	if (fileName.endsWith(".tsbuildinfo")) return false;
	return true;
}

export function copyTemplate(outDir: string): number {
	let copied = 0;
	cpSync(REPO_ROOT, outDir, {
		recursive: true,
		filter: (source) => {
			const relativePath = path
				.relative(REPO_ROOT, source)
				.split(path.sep)
				.join("/");
			if (relativePath === "") return true;
			const keep = shouldCopy(relativePath);
			if (keep) copied++;
			return keep;
		},
	});
	return copied;
}
