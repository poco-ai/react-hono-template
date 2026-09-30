import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";

const sourceRoot = path.resolve(import.meta.dir, "../src");
function files(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const file = path.join(directory, entry.name);
		return entry.isDirectory()
			? files(file)
			: /\.tsx?$/.test(file) && !file.endsWith("routeTree.gen.ts")
				? [file]
				: [];
	});
}

test("views consume feature data instead of owning business requests or cache policies", () => {
	const views = [
		...files(path.join(sourceRoot, "pages")),
		...files(path.join(sourceRoot, "routes")),
		...files(path.join(sourceRoot, "components")),
		...files(path.join(sourceRoot, "features")).filter((f) =>
			f.includes("/components/"),
		),
	];
	for (const file of views) {
		const source = readFileSync(file, "utf8");
		const tree = ts.createSourceFile(
			file,
			source,
			ts.ScriptTarget.Latest,
			true,
		);
		function visit(node: ts.Node) {
			if (ts.isImportDeclaration(node)) {
				const module = (node.moduleSpecifier as ts.StringLiteral).text;
				assert.ok(!module.includes("lib/queries"), file);
				if (module === "@tanstack/react-query") {
					assert.doesNotMatch(
						node.getText(tree),
						/\b(useMutation|useQueryClient)\b/,
						file,
					);
				}
			}
			if (ts.isPropertyAssignment(node)) {
				assert.ok(
					!["mutationFn", "queryFn", "queryKey"].includes(
						node.name.getText(tree),
					),
					file,
				);
			}
			if (
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression)
			) {
				assert.doesNotMatch(
					node.expression.name.text,
					/^\$(get|post|patch|delete|put)$|^(invalidateQueries|setQueryData|removeQueries)$/,
					file,
				);
			}
			ts.forEachChild(node, visit);
		}
		visit(tree);
	}
});

test("feature data imports never depend on views and remain acyclic", () => {
	const modules = files(path.join(sourceRoot, "features")).filter((f) =>
		f.endsWith("/data.ts"),
	);
	const dependencies = new Map<string, string[]>();
	for (const file of modules) {
		const tree = ts.createSourceFile(
			file,
			readFileSync(file, "utf8"),
			ts.ScriptTarget.Latest,
			true,
		);
		const imports = tree.statements.filter(ts.isImportDeclaration);
		const targets: string[] = [];
		for (const node of imports) {
			const module = (node.moduleSpecifier as ts.StringLiteral).text;
			assert.doesNotMatch(
				module,
				/(^|\/)(pages|routes|components)(\/|$)/,
				file,
			);
			if (node.importClause?.isTypeOnly) continue;
			if (
				node.importClause?.namedBindings &&
				ts.isNamedImports(node.importClause.namedBindings) &&
				node.importClause.namedBindings.elements.every((e) => e.isTypeOnly)
			)
				continue;
			const target = module.startsWith("@/")
				? path.resolve(sourceRoot, module.slice(2))
				: module.startsWith(".")
					? path.resolve(path.dirname(file), module)
					: undefined;
			if (target && modules.includes(`${target}.ts`))
				targets.push(`${target}.ts`);
		}
		dependencies.set(file, targets);
	}
	function visit(file: string, ancestors: string[]) {
		assert.ok(
			!ancestors.includes(file),
			`Cycle: ${[...ancestors, file].join(" → ")}`,
		);
		for (const next of dependencies.get(file) ?? [])
			visit(next, [...ancestors, file]);
	}
	for (const file of modules) visit(file, []);
});
