import type { Context } from "hono";
import { ok } from "../lib/response";
import {
	enabledSocialProviders,
	type SocialProvidersConfig,
} from "../lib/social-providers";

export const createOAuthController = (social?: SocialProvidersConfig) => ({
	providers: (c: Context) =>
		ok(c, { providers: enabledSocialProviders(social) }),
});
