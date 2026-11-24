import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getFeature, REPO_ROOT } from "./manifest";

export type FeatureMeta = {
	id: string;
	/** `import { <name> } from "./features/<id>/module"` in the api manifest. */
	moduleExportName?: string;
	/** `import { <name> } from "./<id>/web"` in the web registry. */
	webExportName?: string;
	/** `export const define<X>Tables` in `features/<id>/schema.ts`. */
	schemaFactory?: string;
	/** Keys returned by the schema factory (`return { ... }`). */
	tableKeys: string[];
	/** Locale namespaces claimed through `i18n/locales/en/<ns>.ts`. */
	i18nNamespaces: string[];
	/** Docs claimed by this feature. */
	docs: string[];
};

const API_MANIFEST = path.join(REPO_ROOT, "apps/api/src/manifest.ts");
const WEB_REGISTRY = path.join(REPO_ROOT, "apps/web/src/features/registry.ts");

const read = (relativePath: string): string =>
	readFileSync(path.join(REPO_ROOT, relativePath), "utf8");

const manifestSource = readFileSync(API_MANIFEST, "utf8");
const registrySource = readFileSync(WEB_REGISTRY, "utf8");

function moduleExportName(id: string): string | undefined {
	const match = manifestSource.match(
		new RegExp(
			`import\\s*\\{\\s*(\\w+)\\s*\\}\\s*from\\s*"\\./features/${id}/module";`,
		),
	);
	return match?.[1];
}

function webExportName(id: string): string | undefined {
	const match = registrySource.match(
		new RegExp(`import\\s*\\{\\s*(\\w+)\\s*\\}\\s*from\\s*"\\./${id}/web";`),
	);
	return match?.[1];
}

function schemaMeta(id: string): {
	factory?: string;
	keys: string[];
} {
	const relativePath = `apps/api/src/features/${id}/schema.ts`;
	if (!existsSync(path.join(REPO_ROOT, relativePath))) {
		return { keys: [] };
	}
	const source = read(relativePath);
	const factory = source.match(/export const (define\w+Tables)/)?.[1];
	const block = source.match(/return \{\n([\s\S]*?)\n\t\};/);
	const keys = block
		? [...block[1].matchAll(/^\t\t(\w+),$/gm)].map((match) => match[1])
		: [];
	return { factory, keys };
}

function i18nNamespaces(id: string): string[] {
	const namespaces = new Set<string>();
	for (const claim of getFeature(id).claims) {
		const match = claim.match(/^apps\/web\/src\/i18n\/locales\/en\/(.+)\.ts$/);
		if (match) namespaces.add(match[1]);
	}
	return [...namespaces];
}

function docs(id: string): string[] {
	return getFeature(id).claims.filter(
		(claim) => claim.endsWith(".md") && !claim.startsWith("apps/"),
	);
}

const cache = new Map<string, FeatureMeta>();

export function featureMeta(id: string): FeatureMeta {
	const cached = cache.get(id);
	if (cached) return cached;
	const schema = schemaMeta(id);
	const meta: FeatureMeta = {
		id,
		moduleExportName: moduleExportName(id),
		webExportName: webExportName(id),
		schemaFactory: schema.factory,
		tableKeys: schema.keys,
		i18nNamespaces: i18nNamespaces(id),
		docs: docs(id),
	};
	cache.set(id, meta);
	return meta;
}

/**
 * Web registry declaration order (the subset of it the trimmed tree keeps).
 * Used to build the route unions in a stable order.
 */
export function registryOrder(): string[] {
	const ids: string[] = [];
	for (const match of registrySource.matchAll(
		/import\s*\{\s*\w+\s*\}\s*from\s*"\.\/([a-z0-9-]+)\/web";/g,
	)) {
		ids.push(match[1]);
	}
	return ids;
}
