import { queryOptions } from "@tanstack/react-query";
import { mcpInfoKey } from "@/features/keys";
import { client, unwrap } from "@/lib/api";

export type McpInfoDto = {
	orgId: string;
	enabled: boolean;
	transport: string;
	endpoint: string;
	scopes: {
		apiKey: string[];
		oauth: string[];
	};
	apiKey: {
		scheme: string;
		header: string;
		prefix: string;
	};
	oauth: {
		resource: string;
		loginPage: string;
		consentPage: string;
		dynamicClientRegistration: boolean;
	};
	instructions: string[];
};

export function mcpInfoQuery(orgId: string) {
	return queryOptions({
		queryKey: mcpInfoKey(orgId),
		queryFn: (): Promise<McpInfoDto> =>
			unwrap(
				client.api.orgs[":orgId"].mcp.info.$get({
					param: { orgId },
				}),
			),
	});
}

export type OAuthConsentResult = {
	redirect: true;
	url: string;
};

/**
 * Completes the better-auth MCP consent screen. The endpoint is part of the
 * better-auth handler rather than the typed app router, so it is called with
 * fetch directly.
 */
export async function submitOAuthConsent({
	accept,
	oauthQuery,
}: {
	accept: boolean;
	oauthQuery: string;
}): Promise<OAuthConsentResult> {
	const base = import.meta.env?.VITE_API_URL ?? "";
	const response = await fetch(`${base}/api/auth/oauth2/consent`, {
		method: "POST",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ accept, oauth_query: oauthQuery }),
	});
	const body = (await response.json().catch(() => null)) as
		| OAuthConsentResult
		| { message?: string; error?: string }
		| null;
	if (!response.ok || !body || !("url" in body)) {
		const message =
			body && "message" in body && body.message
				? body.message
				: "Could not complete the authorization request.";
		throw new Error(message);
	}
	return body;
}
