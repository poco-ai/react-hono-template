import path from "node:path";
import { runOrThrow } from "./db-baseline";
import { log } from "./log";

type VerifyStep = {
	label: string;
	cwd: string;
	command: string;
	args: string[];
};

export function verifyOutput(outDir: string): void {
	const steps: VerifyStep[] = [
		{
			label: "bun install",
			cwd: outDir,
			command: "bun",
			args: ["install"],
		},
		{
			label: "regenerate route tree (vite build)",
			cwd: path.join(outDir, "apps/web"),
			command: "bunx",
			args: ["vite", "build"],
		},
		{
			label: "bun run check",
			cwd: outDir,
			command: "bun",
			args: ["run", "check"],
		},
		{
			label: "bun run typecheck",
			cwd: outDir,
			command: "bun",
			args: ["run", "typecheck"],
		},
		{
			label: "bun run build",
			cwd: outDir,
			command: "bun",
			args: ["run", "build"],
		},
		{
			label: "bun run test",
			cwd: outDir,
			command: "bun",
			args: ["run", "test"],
		},
	];

	for (const step of steps) {
		log.step(`verify: ${step.label}`);
		const started = Date.now();
		const result = runOrThrow(
			step.command,
			step.args,
			step.cwd,
			`verify step "${step.label}"`,
		);
		const seconds = ((Date.now() - started) / 1000).toFixed(1);
		log.info(`${step.label} passed in ${seconds}s`);
		if (result.stdout.trim()) {
			const tail = result.stdout.trim().split("\n").slice(-3).join("\n");
			log.info(tail);
		}
	}
}
