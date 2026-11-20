import assert from "node:assert/strict";
import { dirname } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("postgres and redis smoke", { timeout: 30_000 }, async (t) => {
	if (!process.env.DATABASE_URL?.trim() || !process.env.REDIS_URL?.trim()) {
		t.skip("DATABASE_URL and REDIS_URL are not set");
		return;
	}
	const testsDir = dirname(fileURLToPath(import.meta.url));
	const apiRoot = dirname(testsDir);
	const entry = `${testsDir}/postgres-smoke.entry.ts`;
	const proc = (
		globalThis as unknown as {
			Bun: {
				spawn: (options: {
					cmd: string[];
					cwd: string;
					stdout: "pipe";
					stderr: "pipe";
					env: NodeJS.ProcessEnv;
				}) => {
					stdout: ReadableStream<Uint8Array>;
					stderr: ReadableStream<Uint8Array>;
					exited: Promise<number>;
				};
			};
		}
	).Bun.spawn({
		cmd: ["bun", entry],
		cwd: apiRoot,
		stdout: "pipe",
		stderr: "pipe",
		env: process.env,
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	assert.equal(code, 0, `${stdout}\n${stderr}`);
});
