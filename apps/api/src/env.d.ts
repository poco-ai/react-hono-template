declare global {
	namespace Cloudflare {
		interface Env {
			BETTER_AUTH_SECRET: string;
			BETTER_AUTH_URL?: string;
			GITHUB_CLIENT_ID?: string;
			GITHUB_CLIENT_SECRET?: string;
			GOOGLE_CLIENT_ID?: string;
			GOOGLE_CLIENT_SECRET?: string;
			RESEND_API_KEY?: string;
			EMAIL_FROM?: string;
			S3_ENDPOINT?: string;
			S3_REGION?: string;
			S3_ACCESS_KEY_ID?: string;
			S3_SECRET_ACCESS_KEY?: string;
			S3_BUCKET?: string;
			S3_PUBLIC_BASE_URL?: string;
			STRIPE_SECRET_KEY?: string;
			STRIPE_PRICE_ID?: string;
			STRIPE_WEBHOOK_SECRET?: string;
			BILLING_MOCK_MODE?: string;
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
			RATE_LIMITER_AI_FREE: RateLimit;
			RATE_LIMITER_AI_PRO: RateLimit;
		}
	}

	interface Env {
		BETTER_AUTH_SECRET: string;
		BETTER_AUTH_URL?: string;
		GITHUB_CLIENT_ID?: string;
		GITHUB_CLIENT_SECRET?: string;
		GOOGLE_CLIENT_ID?: string;
		GOOGLE_CLIENT_SECRET?: string;
		RESEND_API_KEY?: string;
		EMAIL_FROM?: string;
		S3_ENDPOINT?: string;
		S3_REGION?: string;
		S3_ACCESS_KEY_ID?: string;
		S3_SECRET_ACCESS_KEY?: string;
		S3_BUCKET?: string;
		S3_PUBLIC_BASE_URL?: string;
		STRIPE_SECRET_KEY?: string;
		STRIPE_PRICE_ID?: string;
		STRIPE_WEBHOOK_SECRET?: string;
		BILLING_MOCK_MODE?: string;
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
		RATE_LIMITER_AI_FREE: RateLimit;
		RATE_LIMITER_AI_PRO: RateLimit;
	}
}

export {};
