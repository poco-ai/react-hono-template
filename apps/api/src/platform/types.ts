import type { AiProviderConfig } from "../ai/provider";
import type { SchemaDialect } from "../db/dialect";
import type { Database } from "../db/types";
import type { EmailDeliveryConfig } from "../lib/email";
import type { CacheStore } from "../lib/kv/types";
import type { PlanRateLimiters } from "../lib/rate-limit";
import type { SocialProvidersConfig } from "../lib/social-providers";
import type { StorageAdapter } from "../lib/storage/types";
import type { StripeSetup } from "../lib/stripe";
import type { McpEnvConfig } from "../mcp/config";
import type { AiRateLimiters } from "../services/ai-usage.service";
import type { WebhookJobQueue } from "../services/webhook-delivery.service";

/**
 * Everything the Hono app needs, already constructed. `createApp` does not
 * read Worker bindings or `process.env`.
 */
export type AppPlatform = {
	dialect: SchemaDialect;
	db: Database;
	cache: CacheStore;
	storage: StorageAdapter | null;
	webhookQueue: WebhookJobQueue | null;
	stripeSetup: StripeSetup;
	billingMockEnabled: boolean;
	aiConfig: AiProviderConfig;
	aiRateLimiters?: AiRateLimiters;
	apiRateLimiters?: PlanRateLimiters;
	appWebUrl: string;
	resolvePublicApiUrl: (requestUrl: string) => string;
	trustedOrigins: string[];
	social: SocialProvidersConfig;
	mcpEnv: McpEnvConfig;
	authSecret: string;
	authBaseURL?: string;
	email?: EmailDeliveryConfig;
	allowFirstUserAdmin: boolean;
	allowInsecureLogging: boolean;
};
