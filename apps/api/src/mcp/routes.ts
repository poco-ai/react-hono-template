import { createMcpHandler } from "@modelcontextprotocol/server";
import { API_KEY_SCOPES, PLANS } from "@workspace/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { Dependencies } from "../dependencies";
import type { Auth } from "../lib/auth";
import { backgroundFromContext } from "../lib/background";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import { createMcpAudit, type McpAuditBackground } from "./audit";
import { resolveMcpAuth } from "./auth";
import type { McpConfig } from "./config";
import { createMcpServerFactory } from "./server";
import type { McpToolRuntime } from "./tools";

const localeFromRequest = (request: Request): "en" | "zh" => {
	const header = request.headers.get("accept-language")?.toLowerCase() ?? "";
	return /(^|[,;]\s*)zh\b/.test(header) ? "zh" : "en";
};

const asBackground = (c: Context): McpAuditBackground => {
	const background = backgroundFromContext(c);
	return (task) => background(async () => void (await task()));
};

/**
 * The authenticated, stateless MCP endpoint (POST /mcp).
 *
 * Authentication happens before any MCP handling: API keys are looked up by
 * hash, OAuth tokens are verified by the better-auth MCP helper, and failures
 * return the helper's RFC 9728 challenge untouched. The verified principal is
 * passed to the server factory so tools can be filtered per request.
 */
export const createMcpEndpoint = ({
	auth,
	dependencies,
	config,
}: {
	auth: Auth;
	dependencies: Dependencies;
	config: McpConfig;
}) => {
	return async (c: Context): Promise<Response> => {
		if (!config.enabled) {
			return c.json(
				{
					ok: false,
					error: {
						code: "NOT_FOUND",
						message: "The MCP server is disabled.",
					},
				},
				404,
			);
		}

		const background = asBackground(c);
		const resolved = await resolveMcpAuth({
			request: c.req.raw,
			deps: {
				apiKeyDao: dependencies.daos.apiKeyDao,
				background,
			},
			auth,
			config,
		});
		if ("response" in resolved) return resolved.response;

		const principal = resolved.principal;
		const plan = principal.orgId
			? await dependencies.services.planService.getPlanForOrg(principal.orgId)
			: "free";
		const limit = PLANS[plan].apiRateLimit;
		const limiter =
			plan === "pro"
				? dependencies.apiRateLimiters?.pro
				: dependencies.apiRateLimiters?.free;
		c.header("X-RateLimit-Limit", String(limit));
		if (limiter) {
			const { success } = await limiter.limit({
				key: principal.keyId ?? principal.userId ?? "mcp",
			});
			if (!success) {
				c.header("Retry-After", "60");
				return c.json(
					{
						jsonrpc: "2.0",
						error: {
							code: -32000,
							message: `Rate limit exceeded: max ${limit} requests per minute`,
						},
						id: null,
					},
					429,
				);
			}
		}

		const runtime: McpToolRuntime = {
			principal,
			capabilities: dependencies.ai.capabilities.list(),
			layer: dependencies.ai.capabilities,
			memberDao: dependencies.daos.memberDao,
			appWebUrl: config.appWebUrl,
			locale: localeFromRequest(c.req.raw),
			background,
			audit: createMcpAudit({
				dao: dependencies.daos.aiToolCallDao,
				background,
			}),
			orgAiSettings: dependencies.services.orgAiSettingsService,
		};

		const handler = createMcpHandler(createMcpServerFactory(runtime), {
			legacy: "stateless",
		});
		return handler.fetch(c.req.raw, { authInfo: resolved.principal.authInfo });
	};
};

/**
 * Session-authenticated settings info for the web app. Mounted under
 * /api/orgs/:orgId so requireAuth + requireOrgMember apply. Returns no
 * secrets, only connection metadata.
 */
export const createMcpRoutes = ({ config }: { config: McpConfig }) => {
	return new Hono<SessionEnv & OrgEnv>().get("/api/orgs/:orgId/mcp/info", (c) =>
		ok(c, {
			orgId: c.req.param("orgId"),
			enabled: config.enabled,
			transport: "streamable-http",
			endpoint: config.resource,
			scopes: {
				apiKey: [...API_KEY_SCOPES],
				oauth: [...config.oauthScopes],
			},
			apiKey: {
				scheme: "Bearer",
				header: "Authorization",
				prefix: "sk_",
			},
			oauth: {
				resource: config.resource,
				loginPage: config.loginPage,
				consentPage: config.consentPage,
				dynamicClientRegistration: config.dcrEnabled,
			},
			instructions: [
				"Create an API key with the scopes you need and send it as Authorization: Bearer sk_...",
				"OAuth-capable clients can connect to the endpoint and use the web login and consent pages.",
				"Organization-scoped tools accept an optional orgId. API keys are pinned to their organization; OAuth callers should call list_orgs when they belong to more than one organization.",
			],
		}),
	);
};

export const mcpInfoPath = (orgId: string) =>
	`/api/orgs/${encodeURIComponent(orgId)}/mcp/info`;
