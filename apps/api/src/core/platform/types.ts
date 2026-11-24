import type { SchemaDialect } from "../../db/dialect";
import type { Database } from "../../db/types";
import type { EmailDeliveryConfig } from "../lib/email";
import type { CacheStore } from "../lib/kv/types";
import type {
	AiProviderConfigPort,
	AiRateLimitersPort,
	McpEnvConfigPort,
	StorageAdapter,
	StripeSetupPort,
	WebhookJobQueuePort,
} from "../lib/ports/platform";
import type { PlanRateLimiters } from "../lib/rate-limit";
import type { SocialProvidersConfig } from "../lib/social-providers";

/**
 * Everything the Hono app needs, already constructed. `createApp` does not
 * read Worker bindings or `process.env`.
 *
 * Feature-owned slots use the structural port types from
 * `core/lib/ports/platform.ts`: a trimmed preset simply leaves the defaults
 * (`null` storage/queue, disabled Stripe, empty AI/MCP env) in place, and only
 * enabled modules contribute real implementations.
 */
export type AppPlatform = {
	dialect: SchemaDialect;
	db: Database;
	cache: CacheStore;
	storage: StorageAdapter | null;
	webhookQueue: WebhookJobQueuePort | null;
	stripeSetup: StripeSetupPort;
	billingMockEnabled: boolean;
	aiConfig: AiProviderConfigPort;
	aiRateLimiters?: AiRateLimitersPort;
	apiRateLimiters?: PlanRateLimiters;
	appWebUrl: string;
	resolvePublicApiUrl: (requestUrl: string) => string;
	trustedOrigins: string[];
	social: SocialProvidersConfig;
	mcpEnv: McpEnvConfigPort;
	authSecret: string;
	authBaseURL?: string;
	email?: EmailDeliveryConfig;
	allowFirstUserAdmin: boolean;
	allowInsecureLogging: boolean;
};
