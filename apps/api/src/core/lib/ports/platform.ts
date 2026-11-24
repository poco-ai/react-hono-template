/**
 * Platform contracts owned by core.
 *
 * The concrete implementations live in their feature slices (S3 client,
 * Stripe setup, AI provider config, MCP env, webhook queue), but `AppPlatform`
 * and the module protocol must compile when those slices are trimmed. Feature
 * modules contribute the concrete pieces through `FeatureModule.platform`,
 * and this file only keeps the structural shapes.
 */

export interface StorageAdapter {
	presignPut(
		key: string,
		contentType: string,
		expiresIn: number,
		size: number,
	): Promise<string>;
	presignGet(key: string, expiresIn: number): Promise<string>;
	stat(
		key: string,
	): Promise<{ size: number; contentType: string | null } | null>;
	get(key: string): Promise<{
		body: ReadableStream;
		contentType: string | null;
		contentLength: number | null;
		etag: string | null;
	} | null>;
	remove(key: string): Promise<void>;
	publicUrl(key: string): string | null;
}

/**
 * Stripe availability. `context` stays opaque here; the billing feature
 * narrows it to its SDK client.
 */
export type StripeSetupPort =
	| { status: "disabled"; context: null }
	| { status: "incomplete"; context: null }
	| { status: "enabled"; context: unknown };

export type AiProviderConfigPort = {
	AI_ENABLED?: string;
	AI_PROVIDER?: string;
	AI_BASE_URL?: string;
	AI_API_KEY?: string;
	AI_MODEL?: string;
	AI_MODEL_ALLOWLIST?: string;
	AI_MAX_STEPS?: string;
	AI_MAX_OUTPUT_TOKENS?: string;
};

export type AiRateLimiterPort = {
	limit(input: { key: string }): Promise<{ success: boolean }>;
};

export type AiRateLimitersPort = {
	free?: AiRateLimiterPort;
	pro?: AiRateLimiterPort;
};

export type McpEnvConfigPort = {
	MCP_ENABLED?: string;
	MCP_RESOURCE?: string;
	MCP_LOGIN_PAGE?: string;
	MCP_CONSENT_PAGE?: string;
	MCP_DCR_ENABLED?: string;
	APP_WEB_URL?: string;
	BETTER_AUTH_URL?: string;
};

export type WebhookJobQueuePort = {
	send(message: { deliveryId: string }): Promise<void>;
};

/** Delivery surface the self-host Redis loop needs (webhooks feature). */
export type WebhookDeliveryQueueTarget = {
	deliverFromQueue: (deliveryId: string, attempts: number) => Promise<unknown>;
};

/**
 * Raw env fields feature platform contributions read. `WEBHOOK_QUEUE` is the
 * Cloudflare binding; self-host wiring builds the Redis queue in core.
 */
export type PlatformEnv = {
	S3_ACCESS_KEY_ID?: string;
	S3_SECRET_ACCESS_KEY?: string;
	S3_ENDPOINT?: string;
	S3_SIGNING_ENDPOINT?: string;
	S3_BUCKET?: string;
	S3_REGION?: string;
	S3_PUBLIC_BASE_URL?: string;
	STRIPE_SECRET_KEY?: string;
	STRIPE_PRICE_ID?: string;
	STRIPE_WEBHOOK_SECRET?: string;
	AI_ENABLED?: string;
	AI_PROVIDER?: string;
	AI_BASE_URL?: string;
	AI_API_KEY?: string;
	AI_MODEL?: string;
	AI_MODEL_ALLOWLIST?: string;
	AI_MAX_STEPS?: string;
	AI_MAX_OUTPUT_TOKENS?: string;
	MCP_ENABLED?: string;
	MCP_RESOURCE?: string;
	MCP_LOGIN_PAGE?: string;
	MCP_CONSENT_PAGE?: string;
	MCP_DCR_ENABLED?: string;
	APP_WEB_URL?: string;
	BETTER_AUTH_URL?: string;
	WEBHOOK_QUEUE?: { send(message: { deliveryId: string }): Promise<void> };
};

/** What a feature module contributes before composition starts. */
export type FeaturePlatformPieces = {
	storage?: StorageAdapter | null;
	webhookQueue?: WebhookJobQueuePort | null;
	stripeSetup?: StripeSetupPort;
	aiConfig?: AiProviderConfigPort;
	mcpEnv?: McpEnvConfigPort;
};

export const FEATURE_PLATFORM_DEFAULTS: Required<FeaturePlatformPieces> = {
	storage: null,
	webhookQueue: null,
	stripeSetup: { status: "disabled", context: null },
	aiConfig: {},
	mcpEnv: {},
};
