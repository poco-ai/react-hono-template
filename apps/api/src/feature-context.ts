import type { FeatureContextBase } from "./core/compose";
import type { AiProviderConfig } from "./features/ai/provider";
import type { AiRateLimiters } from "./features/ai/services/ai-usage.service";
import type { StorageAdapter } from "./features/attachments/lib/types";
import type { StripeSetup } from "./features/billing/lib/stripe";
import type { McpEnvConfig } from "./features/mcp/config";
import type { WebhookJobQueue } from "./features/webhooks/services/webhook-delivery.service";

/**
 * Feature registration context with the concrete feature-owned platform
 * types narrowed. Modules whose `register` touches storage, Stripe, the
 * webhook queue, the AI provider or MCP env declare this as their context
 * type.
 *
 * Deliberately standalone: this file must not reference `Dependencies` (or
 * anything derived from the module graph), otherwise the module types
 * become circular and collapse to `any`.
 */
export type FullFeatureContext = FeatureContextBase & {
	storage: StorageAdapter | null;
	stripeSetup: StripeSetup;
	webhookQueue?: WebhookJobQueue | null;
	aiConfig?: AiProviderConfig;
	aiRateLimiters?: AiRateLimiters;
	mcpEnv?: McpEnvConfig;
};
