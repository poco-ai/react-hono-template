import {
	ApiError,
	ApiErrorCode,
	DEFAULT_RUNTIME_CONFIG,
	type RuntimeConfig,
	runtimeConfigSchema,
} from "@workspace/shared";
import type { CacheStore } from "../lib/kv/types";

export const CONFIG_KEY = "config:global";
const L1_TTL_MS = 60_000;

export const createConfigService = (cache: CacheStore) => {
	let l1: { value: RuntimeConfig; expiresAt: number } | null = null;

	const remember = (value: RuntimeConfig) => {
		l1 = { value, expiresAt: Date.now() + L1_TTL_MS };
		return value;
	};

	const getConfig = async (): Promise<RuntimeConfig> => {
		if (l1 && l1.expiresAt > Date.now()) {
			return l1.value;
		}
		const stored = await cache.get(CONFIG_KEY, { cacheTtl: 60 });
		const parsed = runtimeConfigSchema.safeParse(stored);
		if (!parsed.success) {
			if (stored !== null) {
				console.warn(
					"[config] Invalid config payload, using defaults",
					parsed.error.message,
				);
			}
			return remember(DEFAULT_RUNTIME_CONFIG);
		}
		return remember(parsed.data);
	};

	const updateConfig = async (input: RuntimeConfig): Promise<RuntimeConfig> => {
		const config = runtimeConfigSchema.parse(input);
		if (!(await cache.set(CONFIG_KEY, config))) {
			throw new ApiError(
				503,
				ApiErrorCode.SERVICE_UNAVAILABLE,
				"Configuration storage unavailable",
			);
		}
		return remember(config);
	};

	return { getConfig, updateConfig };
};

export type ConfigService = ReturnType<typeof createConfigService>;
