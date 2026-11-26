import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCli } from "../src/cli";

/**
 * parseCli regression net: positional/flag shapes, comma splitting for
 * --features, and cac's fail-closed guards (unknown flags, missing values,
 * extra positionals). --help/--version short-circuit to null.
 */

test("parseCli: positional dir with flags", () => {
	const options = parseCli([
		"bun",
		"create-app",
		"./my-app",
		"--preset",
		"saas",
		"--verify",
	]);
	assert.deepEqual(options, {
		dir: "./my-app",
		out: undefined,
		preset: "saas",
		features: undefined,
		verify: true,
		force: false,
	});
});

test("parseCli: --features splits on commas and trims spaces", () => {
	const options = parseCli([
		"bun",
		"create-app",
		"--features",
		"billing, webhooks",
	]);
	assert.ok(options);
	assert.deepEqual(options.features, ["billing", "webhooks"]);
});

test("parseCli: --out and --force without a positional", () => {
	const options = parseCli([
		"bun",
		"create-app",
		"--out",
		"./x",
		"--preset",
		"minimal",
		"--force",
	]);
	assert.ok(options);
	assert.deepEqual(options, {
		dir: undefined,
		out: "./x",
		preset: "minimal",
		features: undefined,
		verify: false,
		force: true,
	});
});

test("parseCli: no arguments yields an empty selection", () => {
	const options = parseCli(["bun", "create-app"]);
	assert.deepEqual(options, {
		dir: undefined,
		out: undefined,
		preset: undefined,
		features: undefined,
		verify: false,
		force: false,
	});
});

test("parseCli: --help and --version short-circuit to null", () => {
	assert.equal(parseCli(["bun", "create-app", "--help"]), null);
	assert.equal(parseCli(["bun", "create-app", "--version"]), null);
});

test("parseCli: unknown flags fail closed", () => {
	assert.throws(
		() => parseCli(["bun", "create-app", "--nope"]),
		/Unknown option `--nope`/,
	);
});

test("parseCli: missing option values fail closed", () => {
	assert.throws(
		() => parseCli(["bun", "create-app", "./a", "--preset"]),
		/value is missing/,
	);
});

test("parseCli: extra positionals fail closed", () => {
	assert.throws(
		() => parseCli(["bun", "create-app", "./a", "./b"]),
		/Unused args: `\.\/b`/,
	);
});
