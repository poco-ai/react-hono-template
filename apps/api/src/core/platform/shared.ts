import type { AiProviderConfig } from "../../features/ai/provider";
import {
	type S3EnvConfig,
	s3ClientFromConfig,
} from "../../features/attachments/lib/s3-client";
import {
	type StripeSetup,
	setupStripe,
} from "../../features/billing/lib/stripe";
import type { McpEnvConfig } from "../../features/mcp/config";
import type { EmailDeliveryConfig } from "../lib/email";
import type { SocialProvidersConfig } from "../lib/social-providers";
import { resolveTrustedOrigins } from "./origins";
import type { AppPlatform } from "./types";

/**
 * Env fields both the Worker bindings and the Bun process already share.
 * Runtime-specific pieces (database, cache, queue, rate limiters) stay in
 * the adapters.
 */
export type PlatformEnv = S3EnvConfig & {
	STRIPE_SECRET_KEY?: string;
	STRIPE_PRICE_ID?: string;
	STRIPE_WEBHOOK_SECRET?: string;
	BILLING_MOCK_MODE?: string;
	AI_ENABLED?: string;
	AI_PROVIDER?: string;
	AI_BASE_URL?: string;
	AI_API_KEY?: string;
	AI_MODEL?: string;
	AI_MODEL_ALLOWLIST?: string;
	AI_MAX_STEPS?: string;
	AI_MAX_OUTPUT_TOKENS?: string;
	APP_WEB_URL?: string;
	PUBLIC_API_URL?: string;
	BETTER_AUTH_URL?: string;
	TRUSTED_ORIGINS?: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	MCP_ENABLED?: string;
	MCP_RESOURCE?: string;
	MCP_LOGIN_PAGE?: string;
	MCP_CONSENT_PAGE?: string;
	MCP_DCR_ENABLED?: string;
	RESEND_API_KEY?: string;
	EMAIL_FROM?: string;
	ALLOW_FIRST_USER_ADMIN?: string;
	AUTH_ALLOW_INSECURE_LOGGING?: string;
};

export type SharedPlatformConfig = Pick<
	AppPlatform,
	| "storage"
	| "stripeSetup"
	| "billingMockEnabled"
	| "aiConfig"
	| "appWebUrl"
	| "resolvePublicApiUrl"
	| "trustedOrigins"
	| "social"
	| "mcpEnv"
	| "authBaseURL"
	| "email"
	| "allowFirstUserAdmin"
	| "allowInsecureLogging"
>;

const trimOrigin = (value: string | undefined) => {
	const trimmed = value?.trim();
	return trimmed ? trimmed.replace(/\/+$/, "") : "";
};

const aiConfigFrom = (env: PlatformEnv): AiProviderConfig => ({
	AI_ENABLED: env.AI_ENABLED,
	AI_PROVIDER: env.AI_PROVIDER,
	AI_BASE_URL: env.AI_BASE_URL,
	AI_API_KEY: env.AI_API_KEY,
	AI_MODEL: env.AI_MODEL,
	AI_MODEL_ALLOWLIST: env.AI_MODEL_ALLOWLIST,
	AI_MAX_STEPS: env.AI_MAX_STEPS,
	AI_MAX_OUTPUT_TOKENS: env.AI_MAX_OUTPUT_TOKENS,
});

const socialFrom = (env: PlatformEnv): SocialProvidersConfig => ({
	github: {
		clientId: env.GITHUB_CLIENT_ID ?? "",
		clientSecret: env.GITHUB_CLIENT_SECRET ?? "",
	},
	google: {
		clientId: env.GOOGLE_CLIENT_ID ?? "",
		clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
	},
});

const mcpEnvFrom = (env: PlatformEnv): McpEnvConfig => ({
	MCP_ENABLED: env.MCP_ENABLED,
	MCP_RESOURCE: env.MCP_RESOURCE,
	MCP_LOGIN_PAGE: env.MCP_LOGIN_PAGE,
	MCP_CONSENT_PAGE: env.MCP_CONSENT_PAGE,
	MCP_DCR_ENABLED: env.MCP_DCR_ENABLED,
	APP_WEB_URL: env.APP_WEB_URL,
	BETTER_AUTH_URL: env.BETTER_AUTH_URL,
});

const emailFrom = (env: PlatformEnv): EmailDeliveryConfig => ({
	resendApiKey: env.RESEND_API_KEY,
	from: env.EMAIL_FROM,
});

const stripeFrom = (env: PlatformEnv): StripeSetup =>
	setupStripe({
		secretKey: env.STRIPE_SECRET_KEY,
		priceId: env.STRIPE_PRICE_ID,
		webhookSecret: env.STRIPE_WEBHOOK_SECRET,
	});

export const sharedPlatformConfig = (
	env: PlatformEnv,
): SharedPlatformConfig => {
	const appWebUrl = env.APP_WEB_URL?.trim() || "http://localhost:5173";
	return {
		storage: s3ClientFromConfig(env),
		stripeSetup: stripeFrom(env),
		billingMockEnabled: env.BILLING_MOCK_MODE === "true",
		aiConfig: aiConfigFrom(env),
		appWebUrl,
		resolvePublicApiUrl: (requestUrl) => {
			const configured = trimOrigin(env.PUBLIC_API_URL || env.BETTER_AUTH_URL);
			if (configured) return configured;
			return new URL(requestUrl).origin;
		},
		trustedOrigins: resolveTrustedOrigins(env.TRUSTED_ORIGINS),
		social: socialFrom(env),
		mcpEnv: mcpEnvFrom(env),
		authBaseURL: env.BETTER_AUTH_URL,
		email: emailFrom(env),
		allowFirstUserAdmin: env.ALLOW_FIRST_USER_ADMIN === "true",
		allowInsecureLogging: env.AUTH_ALLOW_INSECURE_LOGGING === "true",
	};
};
