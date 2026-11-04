import { createCapabilityExecutor } from "./executor";
import { createReadCapabilities } from "./read";
import type { CapabilityDeps, CapabilityEntry } from "./types";
import { createWriteCapabilities } from "./write";

export * from "./executor";
export * from "./projections";
export * from "./read";
export * from "./types";
export * from "./write";

/** All read and write capabilities built against the given services/daos. */
export const createCapabilityRegistry = (
	deps: CapabilityDeps,
): CapabilityEntry[] => [
	...createReadCapabilities(deps),
	...createWriteCapabilities(deps),
];

/**
 * Convenience wiring used by the chat, panel and MCP surfaces: build the full
 * registry and wrap it in the enforcing executor.
 */
export const createCapabilityLayer = (deps: CapabilityDeps) =>
	createCapabilityExecutor({
		capabilities: createCapabilityRegistry(deps),
		memberDao: deps.daos.memberDao,
	});
