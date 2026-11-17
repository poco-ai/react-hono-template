import { resolveServerDialect } from "../db/dialect";
import { openPostgresDatabase } from "../db/postgres";
import { createRedisCache, withMemoryL1 } from "../lib/redis/cache";
import { createRedisClient, type RedisLike } from "../lib/redis/client";
import { createPlanRateLimiters } from "../lib/redis/rate-limit";
import { createRedisWebhookQueue } from "../lib/redis/webhook-queue";
import { s3ClientFromConfig } from "../lib/storage/s3-client";
import { setupStripe } from "../lib/stripe";
import { resolveTrustedOrigins } from "./origins";
import type { AppPlatform } from "./types";

const required = (env: NodeJS.ProcessEnv, name: string) => {
	const value = env[name]?.trim();
	if (!value) {
		throw new Error(`${name} is required to start the Bun server`);
	}
	return value;
};

const trimOrigin = (value: string | undefined) => {
	const trimmed = value?.trim();
	return trimmed ? trimmed.replace(/\/+$/, "") : "";
};

export type ServerRuntime = {
	platform: AppPlatform;
	redis: RedisLike;
	close: () => Promise<void>;
};

/** Process environment → platform. Call only after `setSqlDialect("postgres")`. */
export const platformFromProcess = (env: NodeJS.ProcessEnv): ServerRuntime => {
	resolveServerDialect(env.SQL_DIALECT);
	const database = openPostgresDatabase(required(env, "DATABASE_URL"));
	const redis = createRedisClient(required(env, "REDIS_URL"));
	const limiters = createPlanRateLimiters(redis);
	const appWebUrl = env.APP_WEB_URL?.trim() || "http://localhost:5173";
	return {
		redis,
		platform: {
			dialect: "postgres",
			db: database.db,
			storage: s3ClientFromConfig(env),
			cache: withMemoryL1(createRedisCache(redis), {
				ttlMs: 60_000,
				match: (key) => key.startsWith("config:"),
			}),
			stripeSetup: setupStripe({
				secretKey: env.STRIPE_SECRET_KEY,
				priceId: env.STRIPE_PRICE_ID,
				webhookSecret: env.STRIPE_WEBHOOK_SECRET,
			}),
			billingMockEnabled: env.BILLING_MOCK_MODE === "true",
			webhookQueue: createRedisWebhookQueue(redis),
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
			aiRateLimiters: limiters.ai,
			apiRateLimiters: limiters.api,
			appWebUrl,
			resolvePublicApiUrl: (requestUrl) => {
				const configured = trimOrigin(
					env.PUBLIC_API_URL || env.BETTER_AUTH_URL,
				);
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
			authSecret: required(env, "BETTER_AUTH_SECRET"),
			authBaseURL: env.BETTER_AUTH_URL,
			email: {
				resendApiKey: env.RESEND_API_KEY,
				from: env.EMAIL_FROM,
			},
			allowFirstUserAdmin: env.ALLOW_FIRST_USER_ADMIN === "true",
			allowInsecureLogging: env.AUTH_ALLOW_INSECURE_LOGGING === "true",
		},
		close: async () => {
			await redis.quit();
			await database.close();
		},
	};
};
