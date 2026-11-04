import { scopeSatisfies } from "@workspace/shared";
import { type ToolSet, tool } from "ai";
import { roleSatisfies } from "../capabilities/access";
import type { CapabilityExecutor } from "../capabilities/executor";
import type { CapabilityContext, CapabilityEntry } from "../capabilities/types";

/** Capabilities the chat actor may invoke, before the executor re-checks. */
export const filterChatCapabilities = (
	capabilities: readonly CapabilityEntry[],
	ctx: CapabilityContext,
): CapabilityEntry[] =>
	capabilities.filter(
		(capability) =>
			capability.scopes.every((scope) =>
				scopeSatisfies(ctx.actor.scopes, scope),
			) && roleSatisfies(ctx.actor.role, capability.minOrgRole),
	);

/**
 * Adapts capability entries to AI SDK tools.
 *
 * Read capabilities execute immediately; writes and destructive capabilities
 * require explicit user approval (AI SDK tool approval).
 */
export const buildChatTools = ({
	capabilities,
	layer,
	ctx,
}: {
	capabilities: readonly CapabilityEntry[];
	layer: Pick<CapabilityExecutor, "execute">;
	ctx: CapabilityContext;
}): ToolSet => {
	const tools: ToolSet = {};

	for (const capability of filterChatCapabilities(capabilities, ctx)) {
		tools[capability.name] = tool({
			description: capability.description,
			inputSchema: capability.input,
			needsApproval: capability.effect !== "read",
			execute: async (input) => {
				const result = await layer.execute(
					capability.name,
					ctx,
					input as unknown,
				);
				return {
					summary: result.summary,
					data: result.data,
					links: result.links,
				};
			},
		});
	}

	return tools;
};
