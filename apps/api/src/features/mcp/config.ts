/**
 * Static MCP server configuration.
 *
 * Everything here is derived from Worker env vars so the auth plugin, the
 * authenticated endpoint and the settings/info route all agree on the same
 * resource identifier, login/consent pages and OAuth scopes.
 */

/** Scopes advertised by the MCP OAuth authorization server. */
export const MCP_OAUTH_SCOPES = [
	"openid",
	"profile",
	"email",
	"offline_access",
	"mcp:read",
	"mcp:write",
	"mcp:admin",
] as const;

export type McpOAuthScope = (typeof MCP_OAUTH_SCOPES)[number];

export type McpConfig = {
	enabled: boolean;
	/** Canonical protected-resource URL (RFC 8707 / RFC 9728), e.g. https://api.example.com/mcp. */
	resource: string;
	loginPage: string;
	consentPage: string;
	/**
	 * Dynamic client registration (RFC 7591). Enabled only for local/dev
	 * because it accepts unauthenticated registrations; production MCP clients
	 * should register through CIMD or a manually provisioned client.
	 */
	dcrEnabled: boolean;
	appWebUrl: string;
	oauthScopes: readonly McpOAuthScope[];
};

export type McpEnvConfig = {
	MCP_ENABLED?: string;
	MCP_RESOURCE?: string;
	MCP_LOGIN_PAGE?: string;
	MCP_CONSENT_PAGE?: string;
	MCP_DCR_ENABLED?: string;
	APP_WEB_URL?: string;
	BETTER_AUTH_URL?: string;
};

const DEFAULT_APP_WEB_URL = "http://localhost:5173";
const DEFAULT_API_ORIGIN = "http://localhost:8787";

const trimUrl = (value: string) => value.trim().replace(/\/+$/, "");

const isEnabled = (value: string | undefined) =>
	value?.trim().toLowerCase() === "true";

export const resolveMcpConfig = (env: McpEnvConfig = {}): McpConfig => {
	const appWebUrl = trimUrl(env.APP_WEB_URL ?? "") || DEFAULT_APP_WEB_URL;
	// In production BETTER_AUTH_URL is the API origin. Locally it may point at
	// the Vite proxy, so MCP_RESOURCE in .dev.vars should be set explicitly.
	const apiOrigin = trimUrl(env.BETTER_AUTH_URL ?? "") || DEFAULT_API_ORIGIN;
	return {
		enabled: isEnabled(env.MCP_ENABLED),
		resource: trimUrl(env.MCP_RESOURCE ?? "") || `${apiOrigin}/mcp`,
		loginPage: trimUrl(env.MCP_LOGIN_PAGE ?? "") || `${appWebUrl}/login`,
		consentPage: trimUrl(env.MCP_CONSENT_PAGE ?? "") || `${appWebUrl}/consent`,
		dcrEnabled: isEnabled(env.MCP_DCR_ENABLED),
		appWebUrl,
		oauthScopes: MCP_OAUTH_SCOPES,
	};
};
