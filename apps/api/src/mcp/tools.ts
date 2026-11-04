import {
	type CallToolResult,
	fromJsonSchema,
	type JsonSchemaType,
	type McpServer,
	type StandardSchemaWithJSON,
	type ToolAnnotations,
} from "@modelcontextprotocol/server";
import {
	ApiError,
	ApiErrorCode,
	scopeSatisfies,
	scopesSatisfy,
} from "@workspace/shared";
import { z } from "zod";
import { roleSatisfies } from "../capabilities/access";
import type { CapabilityExecutor } from "../capabilities/executor";
import type {
	CapabilityContext,
	CapabilityEntry,
	CapabilityResult,
	OrgRole,
} from "../capabilities/types";
import type { MemberDao, MemberOrgSummary } from "../dao/member.dao";
import type { OrgAiSettingsService } from "../services/org-ai-settings.service";
import type { McpAudit } from "./audit";
import type { McpPrincipal } from "./auth";

export type McpMemberDao = Pick<
	MemberDao,
	"findByOrgAndUser" | "isOrgFrozen" | "listMembershipsByUser"
>;

export type McpBackground = (task: () => Promise<unknown>) => void;

export type McpToolRuntime = {
	principal: McpPrincipal;
	capabilities: readonly CapabilityEntry[];
	layer: Pick<CapabilityExecutor, "execute">;
	memberDao: McpMemberDao;
	appWebUrl: string;
	locale: "en" | "zh";
	background: McpBackground;
	audit?: McpAudit;
	/** Optional strict-write policy lookup (organization AI settings). */
	orgAiSettings?: Pick<OrgAiSettingsService, "get">;
};

/**
 * Capabilities exposed by this caller before per-call authorization.
 *
 * - Scope filtering is cumulative (read < write < admin).
 * - API keys may run admin capabilities when the key has the admin scope;
 *   owner-only capabilities stay user-only.
 * - For OAuth callers the organization is not in the token, so listing uses
 *   the caller's memberships: role-gated tools appear when at least one
 *   membership satisfies the role, and writes disappear when every membership
 *   is frozen.
 * - A frozen API-key organization hides writes from `tools/list`; the
 *   executor still enforces this on every call.
 */
export const filterMcpCapabilities = async ({
	capabilities,
	principal,
	memberDao,
}: {
	capabilities: readonly CapabilityEntry[];
	principal: McpPrincipal;
	memberDao: McpMemberDao;
}): Promise<CapabilityEntry[]> => {
	const memberships: MemberOrgSummary[] | undefined =
		principal.method === "oauth" && principal.userId
			? await memberDao.listMembershipsByUser(principal.userId)
			: undefined;
	const apiKeyFrozen =
		principal.method === "api_key" && principal.orgId
			? await memberDao.isOrgFrozen(principal.orgId)
			: false;

	return capabilities.filter((capability) => {
		if (!scopesSatisfy(principal.scopes, capability.scopes)) return false;
		if (capability.orgScoped === false) return true;

		if (principal.method === "api_key") {
			if (!principal.orgId) return false;
			if (capability.minOrgRole) {
				const allowed =
					principal.scopes.includes("admin") &&
					capability.minOrgRole !== "owner";
				if (!allowed) return false;
			}
			if (capability.effect !== "read" && apiKeyFrozen) return false;
			return true;
		}

		if (!memberships || memberships.length === 0) return false;
		if (
			capability.minOrgRole &&
			!memberships.some((membership) =>
				roleSatisfies(membership.role, capability.minOrgRole),
			)
		) {
			return false;
		}
		if (
			capability.effect !== "read" &&
			!memberships.some((membership) => !membership.frozen)
		) {
			return false;
		}
		return true;
	});
};

/** Builds the capability context shared by tools, resources and prompts. */
export const buildCapabilityContext = ({
	runtime,
	orgId,
	role,
}: {
	runtime: McpToolRuntime;
	orgId?: string;
	role?: string;
}): CapabilityContext => ({
	orgId,
	actor: {
		userId: runtime.principal.userId,
		keyId: runtime.principal.keyId,
		surface: "mcp",
		scopes: runtime.principal.scopes,
		role: role as OrgRole | undefined,
	},
	canWrite: scopeSatisfies(runtime.principal.scopes, "write"),
	locale: runtime.locale,
	webBaseUrl: runtime.appWebUrl,
	background: runtime.background,
});

export type ResolvedOrgContext = {
	orgId?: string;
	role?: string;
};

/**
 * Resolves which organization a call applies to.
 *
 * API keys are pinned to their own organization. OAuth callers pass `orgId`
 * explicitly or, when they belong to exactly one organization, it is inferred.
 */
export const resolveOrgContext = async ({
	capability,
	requestedOrgId,
	principal,
	memberDao,
}: {
	capability: Pick<CapabilityEntry, "orgScoped">;
	requestedOrgId?: string;
	principal: McpPrincipal;
	memberDao: McpMemberDao;
}): Promise<ResolvedOrgContext> => {
	if (capability.orgScoped === false) {
		return { orgId: principal.orgId };
	}

	if (principal.method === "api_key") {
		if (!principal.orgId) {
			throw new ApiError(
				ApiErrorCode.FORBIDDEN,
				"This API key is not scoped to an organization.",
			);
		}
		if (requestedOrgId && requestedOrgId !== principal.orgId) {
			throw new ApiError(
				ApiErrorCode.FORBIDDEN,
				"This API key is scoped to a different organization.",
			);
		}
		return { orgId: principal.orgId };
	}

	if (!principal.userId) {
		throw new ApiError(
			ApiErrorCode.UNAUTHORIZED,
			"This token is not associated with a user.",
		);
	}

	let orgId = requestedOrgId;
	if (!orgId) {
		const memberships = await memberDao.listMembershipsByUser(principal.userId);
		if (memberships.length === 1) {
			orgId = memberships[0]?.id;
		} else {
			throw new ApiError(
				ApiErrorCode.MCP_ORG_REQUIRED,
				memberships.length === 0
					? "You do not belong to any organization."
					: "Organization context required. Call the list_orgs tool, then retry with the orgId argument.",
			);
		}
	}
	if (!orgId) {
		throw new ApiError(
			ApiErrorCode.MCP_ORG_REQUIRED,
			"Organization context required. Call the list_orgs tool, then retry with the orgId argument.",
		);
	}

	const membership = await memberDao.findByOrgAndUser(orgId, principal.userId);
	if (!membership) {
		throw new ApiError(
			ApiErrorCode.NOT_FOUND,
			"Organization not found or you are not a member.",
		);
	}
	return { orgId, role: membership.role };
};

// ---------------------------------------------------------------------------
// Tool input schemas
// ---------------------------------------------------------------------------

const ORG_ID_DESCRIPTION =
	"Optional organization id. API keys are pinned to their organization. OAuth callers may omit it when they belong to exactly one organization, otherwise call list_orgs first.";

const inputSchemaCache = new WeakMap<CapabilityEntry, StandardSchemaWithJSON>();

/**
 * Converts a capability's zod input to a JSON Schema accepted by MCP and adds
 * the optional `orgId` argument the MCP surface resolves before execution.
 * Domain validation still happens in the executor with the original schema.
 */
export const mcpInputSchema = (
	capability: CapabilityEntry,
): StandardSchemaWithJSON => {
	const cached = inputSchemaCache.get(capability);
	if (cached) return cached;

	const json = z.toJSONSchema(capability.input, {
		io: "input",
		target: "draft-2020-12",
	}) as JsonSchemaType;
	const baseProperties =
		json.properties &&
		typeof json.properties === "object" &&
		!Array.isArray(json.properties)
			? (json.properties as Record<string, unknown>)
			: {};
	const schema = {
		...json,
		type: "object",
		properties:
			capability.orgScoped === false
				? baseProperties
				: {
						...baseProperties,
						orgId: { type: "string", description: ORG_ID_DESCRIPTION },
					},
	} as JsonSchemaType;

	const built = fromJsonSchema(schema);
	inputSchemaCache.set(capability, built);
	return built;
};

export const toolAnnotations = (
	effect: CapabilityEntry["effect"],
): ToolAnnotations => ({
	readOnlyHint: effect === "read",
	destructiveHint: effect === "destructive",
	idempotentHint: effect === "read",
});

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

const toToolResult = (result: CapabilityResult<unknown>): CallToolResult => ({
	content: [{ type: "text", text: result.summary }],
	structuredContent: {
		summary: result.summary,
		data: result.data,
		links: result.links,
	} as Record<string, unknown>,
});

const toToolError = (error: ApiError): CallToolResult => ({
	isError: true,
	content: [
		{
			type: "text",
			text: `${error.code}: ${error.message}`,
		},
	],
	structuredContent: {
		error: { code: error.code, message: error.message },
	},
});

const asArgumentObject = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

export const executeCapabilityTool = async (
	runtime: McpToolRuntime,
	capability: CapabilityEntry,
	rawArgs: unknown,
): Promise<CallToolResult> => {
	const startedAt = Date.now();
	const args = asArgumentObject(rawArgs);
	const requestedOrgId =
		typeof args.orgId === "string" && args.orgId.trim()
			? args.orgId.trim()
			: undefined;
	const { orgId: _orgId, ...input } = args;
	void _orgId;

	let orgId: string | undefined;
	try {
		const resolved = await resolveOrgContext({
			capability,
			requestedOrgId,
			principal: runtime.principal,
			memberDao: runtime.memberDao,
		});
		orgId = resolved.orgId;
		if (capability.effect !== "read" && orgId && runtime.orgAiSettings) {
			const settings = await runtime.orgAiSettings.get(orgId);
			if (settings.strictMcpWrites) {
				return toToolError(
					new ApiError(
						ApiErrorCode.FORBIDDEN,
						"MCP writes are disabled by this organization's policy. Use the in-app AI assistant for writes.",
					),
				);
			}
		}
		const ctx = buildCapabilityContext({
			runtime,
			orgId,
			role: resolved.role,
		});
		const result = await runtime.layer.execute(capability.name, ctx, input);
		runtime.audit?.({
			orgId,
			userId: runtime.principal.userId,
			toolName: capability.name,
			effect: capability.effect,
			status: "succeeded",
			durationMs: Date.now() - startedAt,
			input,
		});
		return toToolResult(result);
	} catch (error) {
		if (error instanceof ApiError) {
			runtime.audit?.({
				orgId,
				userId: runtime.principal.userId,
				toolName: capability.name,
				effect: capability.effect,
				status: "failed",
				errorCode: error.code,
				durationMs: Date.now() - startedAt,
				input,
			});
			return toToolError(error);
		}
		throw error;
	}
};

/** Registers each visible capability as an MCP tool. */
export const registerCapabilityTools = (
	server: McpServer,
	runtime: McpToolRuntime,
) => {
	for (const capability of runtime.capabilities) {
		server.registerTool(
			capability.name,
			{
				title: capability.name,
				description: capability.description,
				inputSchema: mcpInputSchema(capability),
				annotations: toolAnnotations(capability.effect),
			},
			async (args) => executeCapabilityTool(runtime, capability, args),
		);
	}
};
