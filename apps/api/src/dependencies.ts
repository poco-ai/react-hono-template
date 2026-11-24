import { composeModules } from "./core/compose";
import type { CacheStore } from "./core/lib/kv/types";
import type { PlanRateLimiters } from "./core/lib/rate-limit";
import type { Database } from "./db/types";
import type { AiProviderConfig } from "./features/ai/provider";
import type { AiRateLimiters } from "./features/ai/services/ai-usage.service";
import type { StorageAdapter } from "./features/attachments/lib/types";
import type { StripeSetup } from "./features/billing/lib/stripe";
import type { McpEnvConfig } from "./features/mcp/config";
import type { WebhookJobQueue } from "./features/webhooks/services/webhook-delivery.service";
import { FEATURE_MODULES } from "./manifest";

export type { PlanRateLimiters, RateLimiter } from "./core/lib/rate-limit";
export type { FullFeatureContext } from "./feature-context";

/**
 * Thin facade over the module composition (Phase 2b): the service graph is
 * assembled by `composeModules` from the feature modules listed in
 * `src/manifest.ts`. Kept as an export so existing consumers (tests, the
 * public API sub-app, MCP endpoint) keep their `Dependencies` typing.
 */
export const createDependencies = ({
	db,
	storage,
	cache,
	stripeSetup,
	billingMockEnabled,
	webhookQueue = null,
	aiConfig = {},
	aiRateLimiters,
	apiRateLimiters,
	appWebUrl = "http://localhost:5173",
	resolvePublicApiUrl = (requestUrl: string) => new URL(requestUrl).origin,
	allowFirstUserAdmin = false,
	mcpEnv,
}: {
	db: Database;
	storage: StorageAdapter | null;
	cache: CacheStore;
	stripeSetup: StripeSetup;
	billingMockEnabled: boolean;
	webhookQueue?: WebhookJobQueue | null;
	aiConfig?: AiProviderConfig;
	aiRateLimiters?: AiRateLimiters;
	apiRateLimiters?: PlanRateLimiters;
	appWebUrl?: string;
	resolvePublicApiUrl?: (requestUrl: string) => string;
	allowFirstUserAdmin?: boolean;
	mcpEnv?: McpEnvConfig;
}) =>
	composeModules(
		{
			db,
			storage,
			cache,
			stripeSetup,
			billingMockEnabled,
			webhookQueue,
			aiConfig,
			aiRateLimiters,
			apiRateLimiters,
			appWebUrl,
			resolvePublicApiUrl,
			allowFirstUserAdmin,
			mcpEnv,
		},
		FEATURE_MODULES,
	).dependencies;

export type Dependencies = ReturnType<typeof createDependencies>;
