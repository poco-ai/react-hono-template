import { drizzle } from "drizzle-orm/d1";
import { authRelations } from "../db/auth-schema";
import { createKvCache } from "../lib/kv/cache";
import { s3ClientFromConfig } from "../lib/storage/s3-client";
import { setupStripe } from "../lib/stripe";
import type { WebhookJobQueue } from "../services/webhook-delivery.service";
import { resolveTrustedOrigins } from "./origins";
import type { AppPlatform } from "./types";

const trimOrigin = (value: string | undefined) => {
	const trimmed = value?.trim();
	return trimmed ? trimmed.replace(/\/+$/, "") : "";
};

/** Worker bindings → platform. This is the only Cloudflare-shaped adapter. */
export const platformFromBindings = (env: Env): AppPlatform => {
	const db = drizzle(env.DB, { relations: authRelations });
	const webhookQueue: WebhookJobQueue | null = env.WEBHOOK_QUEUE
		? {
				send: async (message) => {
					await env.WEBHOOK_QUEUE.send(message);
				},
			}
		: null;

	return {
		dialect: "sqlite",
		db,
		storage: s3ClientFromConfig(env),
		cache: createKvCache(env.KV),
		stripeSetup: setupStripe({
			secretKey: env.STRIPE_SECRET_KEY,
			priceId: env.STRIPE_PRICE_ID,
			webhookSecret: env.STRIPE_WEBHOOK_SECRET,
		}),
		billingMockEnabled: env.BILLING_MOCK_MODE === "true",
		webhookQueue,
		aiConfig: {
			AI_ENABLED: env.AI_ENABLED,
			AI_PROVIDER: env.AI_PROVIDER,
			AI_BASE_URL: env.AI_BASE_URL,
			AI_API_KEY: env.AI_API_KEY,
			AI_MODEL: env.AI_MODEL,
			AI_MODEL_ALLOWLIST: env.AI_MODEL_ALLOWLIST,
			AI_MAX_STEPS: env.AI_MAX_STEPS,
			AI_MAX_OUTPUT_TOKENS: env.AI_MAX_OUTPUT_TOKENS,
		},
		aiRateLimiters: {
			free: env.RATE_LIMITER_AI_FREE,
			pro: env.RATE_LIMITER_AI_PRO,
		},
		apiRateLimiters: {
			free: env.RATE_LIMITER_FREE,
			pro: env.RATE_LIMITER_PRO,
		},
		appWebUrl: env.APP_WEB_URL ?? "http://localhost:5173",
		resolvePublicApiUrl: (requestUrl) => {
			const configured = trimOrigin(env.PUBLIC_API_URL || env.BETTER_AUTH_URL);
			if (configured) return configured;
			return new URL(requestUrl).origin;
		},
		trustedOrigins: resolveTrustedOrigins(env.TRUSTED_ORIGINS),
		social: {
			github: {
				clientId: env.GITHUB_CLIENT_ID ?? "",
				clientSecret: env.GITHUB_CLIENT_SECRET ?? "",
			},
			google: {
				clientId: env.GOOGLE_CLIENT_ID ?? "",
				clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
			},
		},
		mcpEnv: {
			MCP_ENABLED: env.MCP_ENABLED,
			MCP_RESOURCE: env.MCP_RESOURCE,
			MCP_LOGIN_PAGE: env.MCP_LOGIN_PAGE,
			MCP_CONSENT_PAGE: env.MCP_CONSENT_PAGE,
			MCP_DCR_ENABLED: env.MCP_DCR_ENABLED,
			APP_WEB_URL: env.APP_WEB_URL,
			BETTER_AUTH_URL: env.BETTER_AUTH_URL,
		},
		authSecret: env.BETTER_AUTH_SECRET,
		authBaseURL: env.BETTER_AUTH_URL,
		email: {
			resendApiKey: env.RESEND_API_KEY,
			from: env.EMAIL_FROM,
		},
		allowFirstUserAdmin: env.ALLOW_FIRST_USER_ADMIN === "true",
		allowInsecureLogging: env.AUTH_ALLOW_INSECURE_LOGGING === "true",
	};
};
