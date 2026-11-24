import { McpServer, type McpServerFactory } from "@modelcontextprotocol/server";
import { registerMcpPrompts } from "./prompts";
import { registerMcpResources } from "./resources";
import {
	filterMcpCapabilities,
	type McpToolRuntime,
	registerCapabilityTools,
} from "./tools";

const SERVER_INFO = {
	name: "react-hono-template",
	version: "1.0.0",
} as const;

const INSTRUCTIONS = [
	"This server exposes a multi-tenant issue tracker.",
	"Tools are authorized by the caller's API key or OAuth scopes (read, write, admin).",
	"Organization-scoped tools accept an optional orgId. API keys are pinned to their organization.",
	"OAuth callers that belong to more than one organization must call list_orgs first and pass orgId on subsequent calls.",
	"Destructive tools should be confirmed with the user before calling.",
].join(" ");

/**
 * Builds a stateless MCP server factory for one authenticated request.
 *
 * A fresh McpServer is created per HTTP request by createMcpHandler; the
 * capability list is filtered against the caller's scopes, role and org state
 * at that point, and every call is re-authorized by the capability executor.
 */
export const createMcpServerFactory = (
	runtime: McpToolRuntime,
): McpServerFactory => {
	const factory = async () => {
		const capabilities = await filterMcpCapabilities({
			capabilities: runtime.capabilities,
			principal: runtime.principal,
			memberDao: runtime.memberDao,
		});
		const visibleRuntime: McpToolRuntime = { ...runtime, capabilities };

		const server = new McpServer(SERVER_INFO, {
			instructions: INSTRUCTIONS,
		});
		registerCapabilityTools(server, visibleRuntime);
		registerMcpResources(server, visibleRuntime);
		registerMcpPrompts(server, visibleRuntime);
		return server;
	};
	return factory;
};
