import type { SchemaDialect } from "../../db/dialect";
import type { Database } from "../../db/types";
import type { AiProviderConfig } from "../../features/ai/provider";
import type { AiRateLimiters } from "../../features/ai/services/ai-usage.service";
import type { StorageAdapter } from "../../features/attachments/lib/types";
import type { StripeSetup } from "../../features/billing/lib/stripe";
import type { McpEnvConfig } from "../../features/mcp/config";
import type { WebhookJobQueue } from "../../features/webhooks/services/webhook-delivery.service";
import type { EmailDeliveryConfig } from "../lib/email";
import type { CacheStore } from "../lib/kv/types";
import type { PlanRateLimiters } from "../lib/rate-limit";
import type { SocialProvidersConfig } from "../lib/social-providers";

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
