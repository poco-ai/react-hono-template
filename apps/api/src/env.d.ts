// Bindings, secrets and wrangler.jsonc vars come from the generated
// worker-configuration.d.ts; this file only adds optional runtime vars it
// does not know about (secrets set per environment, feature toggles).
interface AppEnv {
	BETTER_AUTH_URL?: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	RESEND_API_KEY?: string;
	EMAIL_FROM?: string;
	S3_PUBLIC_BASE_URL?: string;
	PUBLIC_API_URL?: string;
	STRIPE_SECRET_KEY?: string;
	STRIPE_PRICE_ID?: string;
	STRIPE_WEBHOOK_SECRET?: string;
	AI_ENABLED?: string;
	MCP_ENABLED?: string;
	AI_PROVIDER?: string;
	AI_BASE_URL?: string;
	AI_API_KEY?: string;
	AI_MODEL?: string;
	AI_MODEL_ALLOWLIST?: string;
	AI_MAX_STEPS?: string;
	AI_MAX_OUTPUT_TOKENS?: string;
	APP_WEB_URL?: string;
	MCP_RESOURCE?: string;
	MCP_LOGIN_PAGE?: string;
	MCP_CONSENT_PAGE?: string;
	MCP_DCR_ENABLED?: string;
}

declare global {
	// Hono bindings and module-scope `env` from "cloudflare:workers" resolve
	// to two different generated interfaces; extend both from one shape.
	interface Env extends AppEnv {}
	namespace Cloudflare {
		interface Env extends AppEnv {}
	}
}

export {};
