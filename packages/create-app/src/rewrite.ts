import {
	existsSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { globToRegExp } from "./glob";
import type { ResolvedSelection } from "./manifest";
import { featureMeta, registryOrder } from "./meta";

type ImportStatement = {
	start: number;
	end: number;
	text: string;
	module: string;
	localNames: string[];
};

const IMPORT_RE = /^import\s[\s\S]*?from\s*["']([^"']+)["'];?[ \t]*\r?\n?/gm;

function localNamesOf(statement: string): string[] {
	const body = statement.slice(
		statement.indexOf("import") + "import".length,
		statement.lastIndexOf("from"),
	);
	const names = new Set<string>();
	const namespace = body.match(/\*\s*as\s+(\w+)/);
	if (namespace) names.add(namespace[1]);
	const braces = body.match(/\{([\s\S]*?)\}/);
	if (braces) {
		for (const entry of braces[1].split(",")) {
			const cleaned = entry.replace(/^\s*type\s+/, "").trim();
			if (!cleaned) continue;
			const alias = cleaned.match(/\bas\s+(\w+)\s*$/);
			names.add(alias ? alias[1] : cleaned.replace(/\s+/g, ""));
		}
	}
	if (!braces) {
		const defaultImport = body
			.trim()
			.replace(/^type\s+/, "")
			.split(/[\s,{]/)[0];
		if (defaultImport && /^\w+$/.test(defaultImport)) names.add(defaultImport);
	} else {
		const beforeBraces = body.slice(0, body.indexOf("{")).trim();
		const defaultImport = beforeBraces.replace(/^type\s+/, "").trim();
		if (defaultImport && /^\w+$/.test(defaultImport)) names.add(defaultImport);
	}
	return [...names];
}

export function parseImports(source: string): ImportStatement[] {
	return [...source.matchAll(IMPORT_RE)].map((match) => ({
		start: match.index ?? 0,
		end: (match.index ?? 0) + match[0].length,
		text: match[0],
		module: match[1],
		localNames: localNamesOf(match[0]),
	}));
}

/** Removes `import` statements whose module matches `shouldRemove`. */
export function removeImports(
	source: string,
	shouldRemove: (module: string) => boolean,
): { source: string; removedNames: string[] } {
	const statements = parseImports(source);
	const removedNames: string[] = [];
	let result = source;
	for (const statement of [...statements].reverse()) {
		if (!shouldRemove(statement.module)) continue;
		removedNames.push(...statement.localNames);
		result = result.slice(0, statement.start) + result.slice(statement.end);
	}
	return { source: result, removedNames };
}

function isSkipped(
	source: string,
	index: number,
	state: { quote?: string },
): boolean | number {
	const char = source[index];
	if (state.quote) {
		if (char === "\\") return true;
		if (char === state.quote) state.quote = undefined;
		return true;
	}
	if (char === '"' || char === "'" || char === "`") {
		state.quote = char;
		return true;
	}
	if (char === "/" && source[index + 1] === "/") {
		const newline = source.indexOf("\n", index);
		return newline === -1 ? true : newline + 1;
	}
	if (char === "/" && source[index + 1] === "*") {
		const close = source.indexOf("*/", index + 2);
		return close === -1 ? true : close + 2;
	}
	return false;
}

/** Balanced character matcher that skips strings and comments. */
export function findMatching(
	source: string,
	openIndex: number,
	open: string,
	close: string,
): number {
	let depth = 0;
	const state: { quote?: string } = {};
	for (let i = openIndex; i < source.length; i++) {
		const skip = isSkipped(source, i, state);
		if (skip === true) continue;
		if (typeof skip === "number") {
			i = skip - 1;
			continue;
		}
		if (state.quote) continue;
		const char = source[i];
		if (char === open) depth++;
		else if (char === close) {
			depth--;
			if (depth === 0) return i;
		}
	}
	throw new Error(`unbalanced "${open}" at offset ${openIndex}`);
}

/** Removes `.route(...)` chain calls that reference a removed import. */
export function stripRouteCalls(
	source: string,
	removedNames: readonly string[],
): string {
	if (removedNames.length === 0) return source;
	const matchers = removedNames.map(
		(name) => new RegExp(`\\b${name.replace(/[$]/g, "\\$")}\\b`),
	);
	const ranges: Array<{ start: number; end: number }> = [];
	let index = 0;
	while (true) {
		const found = source.indexOf(".route(", index);
		if (found === -1) break;
		const open = source.indexOf("(", found + ".route".length);
		const close = findMatching(source, open, "(", ")");
		const block = source.slice(found, close + 1);
		index = close + 1;
		if (!matchers.some((matcher) => matcher.test(block))) continue;
		let start = found;
		while (
			start > 0 &&
			(source[start - 1] === "\t" || source[start - 1] === " ")
		) {
			start--;
		}
		let end = close + 1;
		while (
			source[end] === "\t" ||
			source[end] === " " ||
			source[end] === "\r"
		) {
			end++;
		}
		if (source[end] === "\n") end++;
		ranges.push({ start, end });
	}
	let result = source;
	for (const range of ranges.reverse()) {
		result = result.slice(0, range.start) + result.slice(range.end);
	}
	return result;
}

const readOut = (outDir: string, relativePath: string): string =>
	readFileSync(path.join(outDir, relativePath), "utf8");

const writeOut = (
	outDir: string,
	relativePath: string,
	content: string,
): void => {
	writeFileSync(path.join(outDir, relativePath), content);
};

function disabledFeatureIds(preset: ResolvedSelection): string[] {
	return preset.allFeatures
		.filter((feature) => !preset.enabled.has(feature.id))
		.map((feature) => feature.id);
}

function removeArrayEntries(
	source: string,
	entries: readonly string[],
): string {
	const targets = new Set(entries.map((entry) => entry.trim()));
	return source
		.split("\n")
		.filter((line) => !targets.has(line.trim()))
		.join("\n");
}

function rewriteApiManifest(outDir: string, preset: ResolvedSelection): void {
	const relativePath = "apps/api/src/manifest.ts";
	let source = readOut(outDir, relativePath);
	const disabled = disabledFeatureIds(preset);
	const removedNames: string[] = [];
	const removed = removeImports(source, (module) => {
		const match = module.match(/^\.\/features\/([a-z0-9-]+)\/module$/);
		return Boolean(match && disabled.includes(match[1]));
	});
	source = removed.source;
	for (const id of disabled) {
		const name = featureMeta(id).moduleExportName;
		if (name) removedNames.push(name);
	}
	source = removeArrayEntries(source, [
		...removedNames.map((name) => `${name},`),
		...disabled.map((id) => `"${id}",`),
	]);
	writeOut(outDir, relativePath, source);
}

function rewriteApiRoutes(outDir: string, preset: ResolvedSelection): void {
	const relativePath = "apps/api/src/routes.ts";
	let source = readOut(outDir, relativePath);
	const disabled = disabledFeatureIds(preset);
	const featureModules = (module: string): string | null =>
		module.match(/^\.\/features\/([a-z0-9-]+)\//)?.[1] ?? null;
	const removed = removeImports(source, (module) => {
		const id = featureModules(module);
		return Boolean(id && disabled.includes(id));
	});
	source = stripRouteCalls(removed.source, removed.removedNames);

	if (disabled.includes("mcp")) {
		source = source
			.replace(/\n\tmcp = resolveMcpConfig\(\),\n/, "\n")
			.replace(/\n\tmcp\?: McpConfig;\n/, "\n");
	}
	writeOut(outDir, relativePath, source);
}

function rewriteWebRegistry(outDir: string, preset: ResolvedSelection): void {
	const relativePath = "apps/web/src/features/registry.ts";
	let source = readOut(outDir, relativePath);
	const disabled = disabledFeatureIds(preset);
	const removed = removeImports(source, (module) => {
		const match = module.match(/^\.\/([a-z0-9-]+)\/web$/);
		return Boolean(match && disabled.includes(match[1]));
	});
	source = removed.source;
	const entries = disabled
		.map((id) => featureMeta(id).webExportName)
		.filter((name): name is string => Boolean(name))
		.map((name) => `${name},`);
	writeOut(outDir, relativePath, removeArrayEntries(source, entries));
}

function rewriteI18nAggregators(
	outDir: string,
	preset: ResolvedSelection,
): void {
	const namespaces = new Set<string>();
	for (const id of disabledFeatureIds(preset)) {
		for (const namespace of featureMeta(id).i18nNamespaces) {
			namespaces.add(namespace);
		}
	}
	for (const language of ["en", "zh"]) {
		const relativePath = `apps/web/src/i18n/locales/${language}.ts`;
		let source = readOut(outDir, relativePath);
		const removed = removeImports(source, (module) =>
			[...namespaces].some(
				(namespace) => module === `./${language}/${namespace}`,
			),
		);
		source = removed.source;
		writeOut(
			outDir,
			relativePath,
			removeArrayEntries(
				source,
				removed.removedNames.map((name) => `${name},`),
			),
		);
	}
}

function rewriteSharedIndex(outDir: string, preset: ResolvedSelection): void {
	const relativePath = "packages/shared/src/index.ts";
	let source = readOut(outDir, relativePath);
	const patterns = disabledClaimPatternsFor(preset);
	const lines = source.split("\n").filter((line) => {
		const match = line.trim().match(/^export \* from "\.\/([^"]+)";$/);
		if (!match) return true;
		const target = `packages/shared/src/${match[1]}.ts`;
		return !patterns.some((pattern) => pattern.test(target));
	});
	source = lines.join("\n");
	writeOut(outDir, relativePath, source);
}

function disabledClaimPatternsFor(preset: ResolvedSelection): RegExp[] {
	const patterns: RegExp[] = [];
	for (const id of disabledFeatureIds(preset)) {
		const feature = preset.allFeatures.find((entry) => entry.id === id);
		if (!feature) continue;
		for (const claim of feature.claims) patterns.push(globToRegExp(claim));
	}
	return patterns;
}

function rewriteApiSchema(outDir: string, preset: ResolvedSelection): void {
	const disabled = disabledFeatureIds(preset);
	const factories: string[] = [];
	const tableKeys: string[] = [];
	for (const id of disabled) {
		const meta = featureMeta(id);
		if (meta.schemaFactory) factories.push(meta.schemaFactory);
		tableKeys.push(...meta.tableKeys);
	}

	const defineRelative = "apps/api/src/db/define-schema.ts";
	let defineSource = readOut(outDir, defineRelative);
	const removed = removeImports(
		defineSource,
		(module) =>
			/^\.\.\/features\/([a-z0-9-]+)\/schema$/.test(module) &&
			disabled.includes(module.split("/")[2] ?? ""),
	);
	defineSource = removeArrayEntries(
		removed.source,
		factories.map((factory) => `...${factory}(kit),`),
	);
	writeOut(outDir, defineRelative, defineSource);

	for (const relativePath of [
		"apps/api/src/db/schema.ts",
		"apps/api/src/db/schema.sqlite.ts",
		"apps/api/src/db/schema.pg.ts",
	]) {
		let source = readOut(outDir, relativePath);
		const target = new Set(tableKeys);
		source = source
			.split("\n")
			.filter((line) => {
				const match = line.trim().match(/^export const (\w+) = built\.\1;$/);
				return !match || !target.has(match[1]);
			})
			.join("\n");
		writeOut(outDir, relativePath, source);
	}

	if (disabled.includes("mcp")) {
		const authRelative = "apps/api/src/db/auth-schema.ts";
		let source = readOut(outDir, authRelative);
		source = source
			.split("\n")
			.filter((line) => {
				const name = line.trim().replace(/,$/, "");
				return !(name === "jwks" || name.startsWith("oauth"));
			})
			.join("\n");
		writeOut(outDir, authRelative, source);
	}
}

function extractFieldArray(source: string, field: string): string {
	const match = source.match(new RegExp(`\\b${field}:\\s*\\(\\)\\s*=>\\s*\\[`));
	if (!match) return "";
	const open = (match.index ?? 0) + match[0].length - 1;
	const close = findMatching(source, open, "[", "]");
	return source.slice(open, close + 1);
}

function extractConstArray(source: string, name: string): string {
	const match = source.match(new RegExp(`export const ${name}[^=]*=\\s*\\[`));
	if (!match) return "";
	const open = (match.index ?? 0) + match[0].length - 1;
	const close = findMatching(source, open, "[", "]");
	return source.slice(open, close + 1);
}

function literals(segment: string, key: string): string[] {
	return [...segment.matchAll(new RegExp(`\\b${key}:\\s*"([^"]+)"`, "g"))].map(
		(match) => match[1],
	);
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function existingUnionEntries(source: string, typeName: string): string[] {
	const match = source.match(
		new RegExp(`export type ${typeName} =([\\s\\S]*?);`),
	);
	if (!match) return [];
	return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function renderUnion(typeName: string, entries: readonly string[]): string {
	const values = unique(entries);
	if (values.length === 0) return `export type ${typeName} = never;`;
	return `export type ${typeName} =\n${values
		.map((value) => `\t| "${value}"`)
		.join("\n")};`;
}

function replaceUnion(
	source: string,
	typeName: string,
	entries: readonly string[],
): string {
	const ordered = [
		...existingUnionEntries(source, typeName).filter((entry) =>
			entries.includes(entry),
		),
		...entries,
	];
	return source.replace(
		new RegExp(`export type ${typeName} =[\\s\\S]*?;`),
		renderUnion(typeName, ordered),
	);
}

function rewriteWebTypes(outDir: string, preset: ResolvedSelection): void {
	const relativePath = "apps/web/src/features/web-types.ts";
	let source = readOut(outDir, relativePath);

	const sidebarTo: string[] = [];
	const sidebarLabels: string[] = [];
	const settingsTo: string[] = [];
	const mobileTo: string[] = [];

	const coreSidebar = existsSync(
		path.join(outDir, "apps/web/src/components/org-sidebar-nav.ts"),
	)
		? readOut(outDir, "apps/web/src/components/org-sidebar-nav.ts")
		: "";
	const coreSettings = readOut(
		outDir,
		"apps/web/src/components/org-settings-nav.ts",
	);
	const coreMobile = readOut(
		outDir,
		"apps/web/src/components/mobile-tab-bar.tsx",
	);

	sidebarTo.push(
		...literals(extractConstArray(coreSidebar, "CORE_SIDEBAR_NAV"), "to"),
	);
	settingsTo.push(
		...literals(extractConstArray(coreSettings, "CORE_SETTINGS_NAV"), "to"),
	);
	mobileTo.push(
		...literals(extractConstArray(coreMobile, "CORE_MOBILE_TABS"), "to"),
	);

	for (const id of registryOrder()) {
		if (!preset.enabled.has(id)) continue;
		const candidates = [
			`apps/web/src/features/${id}/web.ts`,
			`apps/web/src/features/${id}/web.tsx`,
		];
		const relative = candidates.find((candidate) =>
			existsSync(path.join(outDir, candidate)),
		);
		if (!relative) continue;
		const webSource = readOut(outDir, relative);
		const nav = extractFieldArray(webSource, "nav");
		sidebarTo.push(...literals(nav, "to"));
		sidebarLabels.push(...literals(nav, "labelKey"));
		settingsTo.push(
			...literals(extractFieldArray(webSource, "settingsNav"), "to"),
		);
		mobileTo.push(
			...literals(extractFieldArray(webSource, "mobileTabs"), "to"),
		);
	}

	source = replaceUnion(source, "OrgSidebarNavTo", sidebarTo);
	source = replaceUnion(source, "OrgSidebarNavLabelKey", sidebarLabels);
	source = replaceUnion(source, "SettingsNavTo", settingsTo);
	source = replaceUnion(source, "MobileTabTo", mobileTo);
	writeOut(outDir, relativePath, source);
}

/**
 * Fails when a feature marker is unbalanced or nested: an unterminated start
 * would silently delete the rest of the file.
 */
function assertMarkerPairs(source: string, commentPrefix: string): void {
	const startRe = new RegExp(
		`^\\s*${commentPrefix} @feature:([a-z0-9-]+):start\\s*$`,
	);
	const endRe = new RegExp(
		`^\\s*${commentPrefix} @feature:([a-z0-9-]+):end\\s*$`,
	);
	const open: string[] = [];
	for (const line of source.split("\n")) {
		const start = line.match(startRe);
		if (start) {
			if (open.length > 0) {
				throw new Error(
					`nested feature marker "${start[1]}" (inside ${open.join(", ")})`,
				);
			}
			open.push(start[1]);
			continue;
		}
		const end = line.match(endRe);
		if (end) {
			const last = open.pop();
			if (last !== end[1]) {
				throw new Error(
					`unbalanced feature marker "${end[1]}" (open: ${last ?? "none"})`,
				);
			}
		}
	}
	if (open.length > 0) {
		throw new Error(`unterminated feature marker "${open[0]}"`);
	}
}

function stripFeatureMarkers(
	source: string,
	commentPrefix: string,
	preset: ResolvedSelection,
): string {
	const lines = source.split("\n");
	const output: string[] = [];
	let skip = false;
	const startRe = new RegExp(
		`^\\s*${commentPrefix} @feature:([a-z0-9-]+):start\\s*$`,
	);
	const endRe = new RegExp(
		`^\\s*${commentPrefix} @feature:([a-z0-9-]+):end\\s*$`,
	);
	for (const line of lines) {
		const start = line.match(startRe);
		if (start) {
			skip = !preset.enabled.has(start[1]);
			continue;
		}
		const end = line.match(endRe);
		if (end) {
			skip = false;
			continue;
		}
		if (!skip) output.push(line);
	}
	return output.join("\n");
}

/** Removes JSONC trailing commas outside strings/comments. */
export function removeTrailingCommas(source: string): string {
	let result = "";
	const state: { quote?: string } = {};
	for (let i = 0; i < source.length; i++) {
		if (state.quote) {
			result += source[i];
			if (source[i] === "\\") {
				result += source[i + 1] ?? "";
				i++;
			} else if (source[i] === state.quote) {
				state.quote = undefined;
			}
			continue;
		}
		const char = source[i];
		if (char === '"' || char === "'" || char === "`") {
			state.quote = char;
			result += char;
			continue;
		}
		if (char === "/" && source[i + 1] === "/") {
			const newline = source.indexOf("\n", i);
			if (newline === -1) {
				result += source.slice(i);
				break;
			}
			result += source.slice(i, newline);
			i = newline - 1;
			continue;
		}
		if (char === "/" && source[i + 1] === "*") {
			const close = source.indexOf("*/", i + 2);
			if (close === -1) {
				result += source.slice(i);
				break;
			}
			result += source.slice(i, close + 2);
			i = close + 1;
			continue;
		}
		if (char === ",") {
			let lookahead = i + 1;
			while (lookahead < source.length && /\s/.test(source[lookahead] ?? "")) {
				lookahead++;
			}
			if (source[lookahead] === "}" || source[lookahead] === "]") {
				continue;
			}
		}
		result += char;
	}
	return result;
}

/** Strips comments so `JSON.parse` can validate a JSONC document. */
export function stripJsonComments(source: string): string {
	let result = "";
	const state: { quote?: string } = {};
	for (let i = 0; i < source.length; i++) {
		if (state.quote) {
			result += source[i];
			if (source[i] === "\\") {
				result += source[i + 1] ?? "";
				i++;
			} else if (source[i] === state.quote) {
				state.quote = undefined;
			}
			continue;
		}
		const char = source[i];
		if (char === '"' || char === "'" || char === "`") {
			state.quote = char;
			result += char;
			continue;
		}
		if (char === "/" && source[i + 1] === "/") {
			const newline = source.indexOf("\n", i);
			if (newline === -1) break;
			i = newline - 1;
			result += "\n";
			continue;
		}
		if (char === "/" && source[i + 1] === "*") {
			const close = source.indexOf("*/", i + 2);
			if (close === -1) break;
			i = close + 1;
			continue;
		}
		result += char;
	}
	return result;
}

function rewriteWrangler(outDir: string, preset: ResolvedSelection): void {
	const relativePath = "apps/api/wrangler.jsonc";
	let source = readOut(outDir, relativePath);
	assertMarkerPairs(source, "//");
	source = stripFeatureMarkers(source, "//", preset);
	source = removeTrailingCommas(source);
	const parsed = JSON.parse(stripJsonComments(source)) as {
		name?: string;
		queues?: unknown;
		ratelimits?: Array<{ name: string }>;
		vars?: Record<string, string>;
	};
	const rateLimitNames = (parsed.ratelimits ?? []).map((entry) => entry.name);
	if (!preset.enabled.has("webhooks") && parsed.queues) {
		throw new Error("wrangler.jsonc still declares queues without webhooks");
	}
	if (!preset.enabled.has("mcp")) {
		for (const name of Object.keys(parsed.vars ?? {})) {
			if (name.startsWith("MCP_")) {
				throw new Error(`wrangler.jsonc still declares ${name} without mcp`);
			}
		}
	}
	if (!preset.enabled.has("attachments")) {
		for (const name of Object.keys(parsed.vars ?? {})) {
			if (name.startsWith("S3_")) {
				throw new Error(
					`wrangler.jsonc still declares ${name} without attachments`,
				);
			}
		}
	}
	if (!preset.enabled.has("ai")) {
		for (const name of rateLimitNames) {
			if (name.startsWith("RATE_LIMITER_AI_")) {
				throw new Error(`wrangler.jsonc still declares ${name} without ai`);
			}
		}
	}
	writeOut(outDir, relativePath, source);
}

function rewriteDevVars(outDir: string, preset: ResolvedSelection): void {
	const relativePath = "apps/api/.dev.vars.example";
	let source = readOut(outDir, relativePath);
	assertMarkerPairs(source, "#");
	source = stripFeatureMarkers(source, "#", preset);
	// Collapse runs of blank lines left behind by removed sections.
	source = source.replace(/\n{3,}/g, "\n\n");
	writeOut(outDir, relativePath, source);
}

function rewriteReadme(outDir: string, preset: ResolvedSelection): void {
	const relativePath = "README.md";
	const source = readOut(outDir, relativePath);
	const header =
		preset.mode === "custom"
			? `> 本项目由 [react-hono-template](https://github.com/poco-ai/react-hono-template) 自定义选择生成（${preset.features.length} 个特性，minimal 基座）。模板仓库后续的改动不会自动同步，需要按上游 diff 自行合并。\n\n`
			: `> 本项目由 [react-hono-template](https://github.com/poco-ai/react-hono-template) 的 \`${preset.name}\` preset 生成。模板仓库后续的改动不会自动同步，需要按上游 diff 自行合并。\n\n`;
	const allowedDocs = new Set(preset.decl.docs ?? []);
	const lines = source.split("\n").filter((line) => {
		if (line.includes("线上示例：")) return false;
		if (line.startsWith("[![") && line.includes("img.shields.io")) return false;
		const row = line.match(/^\| \[[^\]]+\]\((docs\/[^)]+)\)/);
		if (row && !allowedDocs.has(row[1])) return false;
		if (!preset.enabled.has("api-keys") && line.includes("- **开放能力**")) {
			return false;
		}
		if (!preset.enabled.has("billing") && line.includes("- **订阅**")) {
			return false;
		}
		if (!preset.enabled.has("ai") && line.includes("- **AI 与 MCP**")) {
			return false;
		}
		if (
			!preset.enabled.has("attachments") &&
			line.includes("- **内容与附件**")
		) {
			return false;
		}
		if (!preset.enabled.has("ai") && line.includes("| [AI 与 MCP]")) {
			return false;
		}
		return true;
	});
	const joined = lines
		.map((line) => {
			if (!line.startsWith("面向 Cloudflare")) return line;
			let intro = line;
			if (!preset.enabled.has("billing")) intro = intro.replace("、订阅", "");
			if (!preset.enabled.has("ai")) intro = intro.replace("和 AI", "");
			return intro.replace(/ {2,}/g, " ").replace(/\s+这条/, "这条");
		})
		.join("\n");
	writeOut(outDir, relativePath, `${header}${joined}`);
}

/** Markdown docs that describe template-only workflows or trimmed features. */
function rewriteAgentsDoc(outDir: string, preset: ResolvedSelection): void {
	const relativePath = "AGENTS.md";
	let source = readOut(outDir, relativePath);
	source = removeMarkdownSection(
		source,
		"## AI & MCP",
		!preset.enabled.has("ai"),
	);
	// The generated project has no packages/create-app: the template's test
	// description mentions its selection tests, which do not exist there.
	source = source.replaceAll("create-app selection-resolution, ", "");
	const lines = source.split("\n").filter((line) => {
		if (line.includes("presets/") || line.includes("packages/create-app")) {
			return false;
		}
		// The create-app command itself is template-only; the generated
		// project's package.json drops that script.
		if (line.startsWith("- `bun run create-app")) {
			return false;
		}
		if (line.includes("route-contributions.test.ts")) return false;
		if (!preset.enabled.has("billing") && line.startsWith("- Billing:")) {
			return false;
		}
		if (
			!preset.enabled.has("webhooks") &&
			line.startsWith("- Webhook retries")
		) {
			return false;
		}
		if (!preset.enabled.has("public-api") && line.startsWith("- Public API:")) {
			return false;
		}
		if (
			!preset.enabled.has("search") &&
			line.startsWith("- Full-text search")
		) {
			return false;
		}
		if (
			!preset.enabled.has("mcp") &&
			line.includes("MCP_") &&
			line.includes("vars")
		) {
			return false;
		}
		return true;
	});
	const header =
		preset.mode === "custom"
			? `> 本项目由 react-hono-template 自定义选择生成（${preset.features.length} 个特性，minimal 基座，已裁剪未启用特性）。\n\n`
			: `> 本项目由 react-hono-template 的 \`${preset.name}\` preset 生成（已裁剪未启用特性）。\n\n`;
	writeOut(outDir, relativePath, `${header}${lines.join("\n")}`);
}

function removeMarkdownSection(
	source: string,
	heading: string,
	remove: boolean,
): string {
	if (!remove) return source;
	const start = source.indexOf(heading);
	if (start === -1) return source;
	const rest = source.slice(start + heading.length);
	const next = rest.search(/^## /m);
	return (
		source.slice(0, start) +
		(next === -1 ? "" : rest.slice(next).replace(/^## /, "## "))
	);
}

function rewriteRootPackage(outDir: string): void {
	const relativePath = "package.json";
	const parsed = JSON.parse(readOut(outDir, relativePath)) as {
		scripts?: Record<string, string>;
		workspaces?: string[];
	};
	if (parsed.scripts) {
		delete parsed.scripts["create-app"];
		// The generated project has no packages/create-app: drop the
		// selection-resolution tests from its test script.
		if (parsed.scripts.test) {
			const segments = parsed.scripts.test
				.split("&&")
				.map((segment) => segment.trim())
				.filter(
					(segment) =>
						segment !== "" && !segment.includes("packages/create-app"),
				);
			if (segments.length > 0) parsed.scripts.test = segments.join(" && ");
		}
	}
	if (parsed.workspaces) {
		parsed.workspaces = parsed.workspaces.filter(
			(entry) => entry !== "presets",
		);
	}
	writeOut(outDir, relativePath, `${JSON.stringify(parsed, null, "\t")}\n`);
}

function rewriteApiTsconfig(outDir: string): void {
	const relativePath = "apps/api/tsconfig.json";
	const parsed = JSON.parse(readOut(outDir, relativePath)) as {
		include?: string[];
	};
	if (parsed.include) {
		parsed.include = parsed.include.filter(
			(entry) => entry !== "../../presets/**/*.ts",
		);
	}
	writeOut(outDir, relativePath, `${JSON.stringify(parsed, null, "\t")}\n`);
}

const TEST_REQUIREMENTS: Record<string, string[]> = {
	"apps/api/tests/search-capabilities.test.ts": ["capabilities"],
	"apps/api/tests/routes.test.ts": ["attachments"],
	"apps/api/tests/cleanup.test.ts": ["attachments", "webhooks", "recurrences"],
	"apps/api/tests/redis-ports.test.ts": ["webhooks"],
	"apps/api/tests/postgres-smoke.test.ts": ["attachments", "ai", "webhooks"],
	"apps/api/tests/postgres-smoke.entry.ts": ["attachments", "ai", "webhooks"],
	"apps/api/tests/postgres-smoke.impl.ts": ["attachments", "ai", "webhooks"],
	"apps/web/tests/feature-cache.test.ts": [
		"attachments",
		"webhooks",
		"billing",
		"api-keys",
	],
	"apps/web/tests/feature-requests.test.ts": ["attachments", "webhooks"],
	"apps/web/tests/command-palette-actions.test.ts": ["ai"],
	"apps/web/tests/issue-route-state.test.ts": ["cycles"],
};

function rewriteTests(outDir: string, preset: ResolvedSelection): number {
	const disabled = disabledFeatureIds(preset);
	const needles: string[] = [];
	for (const id of disabled) {
		needles.push(`features/${id}/`, `@/features/${id}`, `@api/features/${id}`);
	}
	let deleted = 0;
	for (const testsDir of ["apps/api/tests", "apps/web/tests"]) {
		const absoluteDir = path.join(outDir, testsDir);
		if (!existsSync(absoluteDir)) continue;
		for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
			if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
			const relativePath = `${testsDir}/${entry.name}`;
			const absolutePath = path.join(outDir, relativePath);
			const content = readFileSync(absolutePath, "utf8");
			const required = TEST_REQUIREMENTS[relativePath] ?? [];
			const missing = required.some((id) => !preset.enabled.has(id));
			const touchedDisabled =
				content.includes("presets/") ||
				needles.some((needle) => content.includes(needle));
			if (!missing && !touchedDisabled) continue;
			unlinkSync(absolutePath);
			deleted++;
		}
	}
	return deleted;
}

export function rewriteAggregators(
	outDir: string,
	preset: ResolvedSelection,
): void {
	rewriteApiManifest(outDir, preset);
	rewriteApiRoutes(outDir, preset);
	rewriteWebRegistry(outDir, preset);
	rewriteI18nAggregators(outDir, preset);
	rewriteSharedIndex(outDir, preset);
	rewriteApiSchema(outDir, preset);
	rewriteWebTypes(outDir, preset);
	rewriteWrangler(outDir, preset);
	rewriteDevVars(outDir, preset);
	rewriteReadme(outDir, preset);
	rewriteAgentsDoc(outDir, preset);
	rewriteRootPackage(outDir);
	rewriteApiTsconfig(outDir);
	rewriteTests(outDir, preset);
}
