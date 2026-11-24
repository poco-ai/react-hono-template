import type { EmailDeliveryConfig } from "../lib/email";
import type { FeaturePlatformPieces, PlatformEnv } from "../lib/ports/platform";
import type { SocialProvidersConfig } from "../lib/social-providers";
import { resolveTrustedOrigins } from "./origins";
import type { AppPlatform } from "./types";

/**
 * Env fields both the Worker bindings and the Bun process already share.
 * Runtime-specific pieces (database, cache, queue, rate limiters) stay in
 * the adapters. Feature slices read the same object through their
 * `FeatureModule.platform` contribution.
 */
export type SharedEnv = {
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
} & PlatformEnv;

export type SharedPlatformConfig = Pick<
	AppPlatform,
	| "billingMockEnabled"
	| "appWebUrl"
	| "resolvePublicApiUrl"
	| "trustedOrigins"
	| "social"
	| "authBaseURL"
	| "email"
	| "allowFirstUserAdmin"
	| "allowInsecureLogging"
>;

const trimOrigin = (value: string | undefined) => {
	const trimmed = value?.trim();
	return trimmed ? trimmed.replace(/\/+$/, "") : "";
};

const socialFrom = (env: SharedEnv): SocialProvidersConfig => ({
	github: {
		clientId: env.GITHUB_CLIENT_ID ?? "",
		clientSecret: env.GITHUB_CLIENT_SECRET ?? "",
	},
	google: {
		clientId: env.GOOGLE_CLIENT_ID ?? "",
		clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
	},
});

const emailFrom = (env: SharedEnv): EmailDeliveryConfig => ({
	resendApiKey: env.RESEND_API_KEY,
	from: env.EMAIL_FROM,
});

/**
 * Core-only env resolution. Storage, Stripe, AI and MCP pieces are
 * contributed by their feature modules (`FeatureModule.platform`); see
 * `createPlatform`.
 */
export const sharedPlatformConfig = (env: SharedEnv): SharedPlatformConfig => {
	const appWebUrl = env.APP_WEB_URL?.trim() || "http://localhost:5173";
	return {
		billingMockEnabled: env.BILLING_MOCK_MODE === "true",
		appWebUrl,
		resolvePublicApiUrl: (requestUrl) => {
			const configured = trimOrigin(env.PUBLIC_API_URL || env.BETTER_AUTH_URL);
			if (configured) return configured;
			return new URL(requestUrl).origin;
		},
		trustedOrigins: resolveTrustedOrigins(env.TRUSTED_ORIGINS),
		social: socialFrom(env),
		authBaseURL: env.BETTER_AUTH_URL,
		email: emailFrom(env),
		allowFirstUserAdmin: env.ALLOW_FIRST_USER_ADMIN === "true",
		allowInsecureLogging: env.AUTH_ALLOW_INSECURE_LOGGING === "true",
	};
};

export type PlatformContributor = {
	id: string;
	platform?(env: PlatformEnv): FeaturePlatformPieces;
};

/** Folds the enabled feature modules' platform contributions over defaults. */
export const featurePlatform = (
	env: SharedEnv,
	modules: readonly PlatformContributor[],
): Required<FeaturePlatformPieces> => {
	const pieces: FeaturePlatformPieces = {};
	for (const module of modules) {
		Object.assign(pieces, module.platform?.(env) ?? {});
	}
	return {
		storage: pieces.storage ?? null,
		webhookQueue: pieces.webhookQueue ?? null,
		stripeSetup: pieces.stripeSetup ?? { status: "disabled", context: null },
		aiConfig: pieces.aiConfig ?? {},
		mcpEnv: pieces.mcpEnv ?? {},
	};
};
