const mcp = {
	enabled: "Enabled",
	disabled: "Disabled",
	disabledTitle: "MCP is disabled",
	disabledDescription:
		"Set MCP_ENABLED=true on the API worker to expose the endpoint.",
	endpointTitle: "MCP endpoint",
	endpointDescription:
		"Use this URL as the remote MCP server. Authentication is required.",
	transport: "Transport",
	apiKeyTitle: "API key access",
	apiKeyDescription:
		"Stable option for headless agents, scripts and CI. Create a key with the scopes you need.",
	oauthTitle: "OAuth access",
	oauthDescription:
		"Interactive clients can discover the authorization server and ask the user to sign in and consent.",
	dcr: "Dynamic client registration",
	createKey: "Manage API keys",
	instructionsTitle: "Connection notes",
	instructions: {
		apiKey:
			"Create an API key with the scopes you need and send it as Authorization: Bearer sk_...",
		oauth:
			"OAuth-capable clients can connect to the endpoint and use the web login and consent pages.",
		orgId:
			"Organization-scoped tools accept an optional orgId. API keys are pinned to their organization; OAuth callers should call list_orgs when they belong to more than one organization.",
	},
	adminOnly:
		"Only owners and admins can create API keys or change MCP settings.",
	securityTitle: "Use read-only keys for autonomous agents",
	securityDescription:
		"Write and destructive tools are guarded by scopes and approvals, but a read-only key is the safest default for unattended agents.",
	snippet: "Config",
	consent: {
		title: "Authorize MCP client",
		description:
			"An MCP client is requesting access to this workspace. Review the scopes before continuing.",
		unknownClient: "Unknown client",
		signInTitle: "Sign in required",
		signInDescription:
			"Sign in to your account before approving this connection.",
		client: "Client",
		scopes: "Requested scopes",
		noScopes: "No scopes requested",
		approve: "Approve",
		deny: "Deny",
		revokeHint:
			"To revoke access later, sign out of the client or ask an organization admin to remove the connection.",
		failed: "Could not complete the authorization request.",
	},
};

export default mcp;
