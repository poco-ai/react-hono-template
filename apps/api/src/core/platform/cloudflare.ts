import { drizzle } from "drizzle-orm/d1";
import { authRelations } from "../../db/auth-schema";
import { createKvCache } from "../lib/kv/cache";
import type { PlatformEnv } from "../lib/ports/platform";
import {
	featurePlatform,
	type PlatformContributor,
	sharedPlatformConfig,
} from "./shared";
import type { AppPlatform } from "./types";

/** Worker bindings → platform. This is the only Cloudflare-shaped adapter. */
export const platformFromBindings = (
	env: Env,
	modules: readonly PlatformContributor[] = [],
): AppPlatform => {
	const db = drizzle(env.DB, { relations: authRelations });
	const platformEnv = env as unknown as PlatformEnv;

	return {
		dialect: "sqlite",
		db,
		cache: createKvCache(env.KV),
		aiRateLimiters: {
			free: env.RATE_LIMITER_AI_FREE,
			pro: env.RATE_LIMITER_AI_PRO,
		},
		apiRateLimiters: {
			free: env.RATE_LIMITER_FREE,
			pro: env.RATE_LIMITER_PRO,
		},
		authSecret: env.BETTER_AUTH_SECRET,
		...featurePlatform(platformEnv, modules),
		...sharedPlatformConfig(platformEnv),
	};
};
