import { requireMcpAuth } from "@better-auth/mcp";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { type ApiKeyScope, normalizeApiKeyScopes } from "@workspace/shared";
import type { ApiKeyDao } from "../dao/api-key.dao";
import type { Auth } from "../lib/auth";
import { sha256Hex } from "../lib/crypto";
import type { McpConfig } from "./config";

const TOUCH_THROTTLE_MS = 60_000;

const API_KEY_PREFIX = "sk_";

/**
 * MCP token scope names mapped onto the app's cumulative API-key scopes.
 * Both the OAuth `mcp:*` names (advertised at consent time) and the plain
 * app names are accepted so manually registered clients can request either.
 */
const OAUTH_TO_APP_SCOPE: Record<string, ApiKeyScope> = {
	"mcp:read": "read",
	"mcp:write": "write",
	"mcp:admin": "admin",
	read: "read",
	write: "write",
	admin: "admin",
};

export type McpAuthMethod = "api_key" | "oauth";

export type McpPrincipal = {
	authInfo: AuthInfo;
	method: McpAuthMethod;
	scopes: ApiKeyScope[];
	/** better-auth user id; absent for API keys created without a user. */
	userId?: string;
	/** API key id; absent for OAuth tokens. */
	keyId?: string;
	/** Fixed organization of an API key. OAuth tokens select an org per call. */
	orgId?: string;
};

export type McpAuthDeps = {
	apiKeyDao: Pick<ApiKeyDao, "findByHash" | "touchLastUsed">;
	/** Wait-until style callback used for lastUsedAt touches. */
	background?: (task: () => Promise<unknown>) => void;
};

export type McpAuthResult =
	| { principal: McpPrincipal }
	| { response: Response };

type OAuthClaims = {
	sub?: unknown;
	scope?: unknown;
	azp?: unknown;
	client_id?: unknown;
	exp?: unknown;
};

const parseBearerToken = (request: Request): string | null => {
	const header = request.headers.get("authorization");
	if (!header) return null;
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	return match?.[1]?.trim() || null;
};

const jsonRpcUnauthorized = (message: string, challenge: string): Response =>
	new Response(
		JSON.stringify({
			jsonrpc: "2.0",
			error: { code: -32000, message },
			id: null,
		}),
		{
			status: 401,
			headers: {
				"content-type": "application/json",
				"www-authenticate": challenge,
			},
		},
	);

/** Maps the space-delimited OAuth `scope` claim to app scopes. */
export const normalizeOAuthScopes = (scopeClaim: unknown): ApiKeyScope[] => {
	const raw = Array.isArray(scopeClaim)
		? scopeClaim
		: typeof scopeClaim === "string"
			? scopeClaim.split(/\s+/)
			: [];
	const mapped = new Set<ApiKeyScope>();
	for (const value of raw) {
		if (typeof value !== "string") continue;
		const scope = OAUTH_TO_APP_SCOPE[value];
		if (scope) mapped.add(scope);
	}
	// Unlike API keys, a token without MCP scopes must not fall back to read:
	// it may be an OIDC token issued for another purpose.
	if (mapped.size === 0) return [];
	return normalizeApiKeyScopes([...mapped]);
};

const oauthPrincipal = (
	token: string,
	claims: OAuthClaims,
): McpPrincipal | null => {
	const userId = typeof claims.sub === "string" ? claims.sub.trim() : "";
	if (!userId) return null;
	const scopes = normalizeOAuthScopes(claims.scope);
	const clientId =
		(typeof claims.azp === "string" && claims.azp) ||
		(typeof claims.client_id === "string" && claims.client_id) ||
		"mcp-client";
	const expiresAt =
		typeof claims.exp === "number" && Number.isFinite(claims.exp)
			? claims.exp
			: undefined;
	return {
		method: "oauth",
		userId,
		scopes,
		authInfo: {
			token,
			clientId,
			scopes,
			...(expiresAt !== undefined ? { expiresAt } : {}),
			extra: {
				authMethod: "oauth",
				userId,
				scopes,
			},
		},
	};
};

/**
 * Resolves the caller of an MCP request.
 *
 * - `sk_...` bearer tokens are hashed and looked up as API keys.
 * - Everything else is verified as a better-auth MCP OAuth access token
 *   (JWT, issuer/audience/JWKS), and a failure returns the helper's RFC 9728
 *   challenge response unchanged.
 *
 * Missing or invalid credentials always produce a response; there is no
 * unauthenticated fallback.
 */
export const resolveMcpAuth = async ({
	request,
	deps,
	auth,
	config,
}: {
	request: Request;
	deps: McpAuthDeps;
	auth: Auth;
	config: Pick<McpConfig, "resource">;
}): Promise<McpAuthResult> => {
	const token = parseBearerToken(request);

	if (token?.startsWith(API_KEY_PREFIX)) {
		const keyHash = await sha256Hex(token);
		const apiKey = await deps.apiKeyDao.findByHash(keyHash);
		if (!apiKey || apiKey.revokedAt) {
			return {
				response: jsonRpcUnauthorized("Invalid API key", 'Bearer realm="mcp"'),
			};
		}
		const scopes = normalizeApiKeyScopes(apiKey.scopes);
		const lastUsedMs = apiKey.lastUsedAt
			? new Date(apiKey.lastUsedAt).getTime()
			: 0;
		if (Date.now() - lastUsedMs > TOUCH_THROTTLE_MS) {
			deps.background?.(() => deps.apiKeyDao.touchLastUsed(apiKey.id));
		}
		const userId = apiKey.createdById ?? undefined;
		return {
			principal: {
				method: "api_key",
				scopes,
				userId,
				keyId: apiKey.id,
				orgId: apiKey.orgId,
				authInfo: {
					token,
					clientId: apiKey.id,
					scopes,
					extra: {
						authMethod: "api_key",
						orgId: apiKey.orgId,
						...(userId ? { userId } : {}),
						keyId: apiKey.id,
						scopes,
					},
				},
			},
		};
	}

	let claims: OAuthClaims | null = null;
	const protectedHandler = requireMcpAuth(
		auth,
		async (_req, verified) => {
			claims = verified as OAuthClaims;
			return new Response(null, { status: 204 });
		},
		{ resource: config.resource },
	);

	const response = await protectedHandler(request);
	if (!claims) {
		// 401 with the RFC 9728 resource_metadata challenge, or a 403
		// insufficient_scope challenge when the token lacks a required scope.
		return { response };
	}

	const principal = oauthPrincipal(token ?? "", claims);
	if (principal) return { principal };

	// A verified token without `sub` cannot act on behalf of a user. Re-run
	// the helper without credentials to produce the standard 401 challenge.
	return {
		response: await mcpOAuthChallenge({ request, auth, config }),
	};
};

/** Builds the standard MCP 401 challenge without consuming the request body. */
export const mcpOAuthChallenge = async ({
	request,
	auth,
	config,
}: {
	request: Request;
	auth: Auth;
	config: Pick<McpConfig, "resource">;
}): Promise<Response> => {
	const headers = new Headers(request.headers);
	headers.delete("authorization");
	const unauthenticated = new Request(request.url, {
		method: request.method,
		headers,
	});
	return requireMcpAuth(auth, async () => new Response(null, { status: 204 }), {
		resource: config.resource,
	})(unauthenticated);
};
