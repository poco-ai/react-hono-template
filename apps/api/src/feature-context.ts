import type { FeatureContextBase } from "./core/compose";
import type {
	AiProviderConfigPort,
	AiRateLimitersPort,
	McpEnvConfigPort,
	StorageAdapter,
	StripeSetupPort,
	WebhookJobQueuePort,
} from "./core/lib/ports/platform";

/**
 * Feature registration context with the feature-owned platform slots narrowed
 * to their structural port types. Modules whose `register` touches storage,
 * Stripe, the webhook queue, the AI provider or MCP env declare this as their
 * context type; a module with a concrete SDK type (billing's Stripe client)
 * narrows it locally.
 *
 * Deliberately standalone: this file must not reference `Dependencies` (or
 * anything derived from the module graph), otherwise the module types
 * become circular and collapse to `any`. It must also not import
 * `features/**`: trimmed presets still typecheck this composition root.
 */
export type FullFeatureContext = FeatureContextBase & {
	storage: StorageAdapter | null;
	stripeSetup: StripeSetupPort;
	webhookQueue?: WebhookJobQueuePort | null;
	aiConfig?: AiProviderConfigPort;
	aiRateLimiters?: AiRateLimitersPort;
	mcpEnv?: McpEnvConfigPort;
};
