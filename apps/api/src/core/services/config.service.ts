import {
	ApiError,
	ApiErrorCode,
	DEFAULT_RUNTIME_CONFIG,
	type RuntimeConfig,
	runtimeConfigSchema,
	runtimeConfigUpdateSchema,
	type UpdateRuntimeConfigInput,
} from "@workspace/shared";
import { createResourceCache } from "../lib/kv/resource-cache";
import type { CacheStore } from "../lib/kv/types";

export const CONFIG_KEY = "config:global";
const L1_TTL_MS = 60_000;
const CONFIG_KV_CACHE_TTL_SECONDS = 60;

/**
 * Config is total: a missing or malformed payload already has a valid
 * fallback, so it is resolved here instead of through `load` — the defaults
 * must never be written back to KV.
 */
const parseStoredConfig = (stored: unknown): RuntimeConfig | null => {
	if (stored === null || stored === undefined) {
		return structuredClone(DEFAULT_RUNTIME_CONFIG);
	}
	const parsed = runtimeConfigSchema.safeParse(stored);
	if (!parsed.success) {
		console.warn(
			"[config] Invalid config payload, using defaults",
			parsed.error.message,
		);
		return structuredClone(DEFAULT_RUNTIME_CONFIG);
	}
	return parsed.data;
};

export const createConfigService = (cache: CacheStore) => {
	const configs = createResourceCache<RuntimeConfig>({
		cache,
		l1TtlMs: L1_TTL_MS,
		cacheTtlSeconds: CONFIG_KV_CACHE_TTL_SECONDS,
		parse: parseStoredConfig,
		// Unreachable while `parseStoredConfig` stays total; keeps the helper's
		// contract explicit and costs nothing.
		load: async () => structuredClone(DEFAULT_RUNTIME_CONFIG),
	});

	const getConfig = async (): Promise<RuntimeConfig> => configs.get(CONFIG_KEY);

	const updateConfig = async (
		input: UpdateRuntimeConfigInput,
	): Promise<RuntimeConfig> => {
		const config = runtimeConfigUpdateSchema.parse(input);
		if (!(await configs.set(CONFIG_KEY, config))) {
			throw new ApiError(
				ApiErrorCode.SERVICE_UNAVAILABLE,
				"Configuration storage unavailable",
			);
		}
		return config;
	};

	return { getConfig, updateConfig };
};

export type ConfigService = ReturnType<typeof createConfigService>;
