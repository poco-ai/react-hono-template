import type { FeatureModule } from "../../core/compose";

/**
 * Capabilities: the framework-neutral read/write capability layer shared by
 * the AI SDK tools and the MCP server. It is a library, not a service
 * contributor — the assembled layer (15 feature services plus the strict
 * MCP writes callback, which reads ai's org settings) is built by the ai
 * feature's registration, mirroring the former dependencies.ts order.
 */
export const capabilitiesModule = {
	id: "capabilities",
	register: () => ({}),
} satisfies FeatureModule;

export type CapabilitiesContribution = ReturnType<
	typeof capabilitiesModule.register
>;
