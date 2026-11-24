import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { LanguageModel } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV3 } from "ai/test";

/**
 * AI provider abstraction.
 *
 * `mock` is a deterministic, network-free model used by local development and
 * CI. `openai-compatible` talks to any OpenAI-compatible chat completions
 * endpoint (DeepSeek, OpenRouter, a local gateway, ...).
 *
 * The factory takes a plain config object instead of reading `env` directly so
 * it stays importable outside workerd (tests, scripts, future workers).
 */

export const AI_PROVIDER_VALUES = ["mock", "openai-compatible"] as const;

export type AiProviderKind = (typeof AI_PROVIDER_VALUES)[number];

export type AiProviderConfig = {
	AI_ENABLED?: string;
	AI_PROVIDER?: string;
	AI_BASE_URL?: string;
	AI_API_KEY?: string;
	AI_MODEL?: string;
	AI_MODEL_ALLOWLIST?: string;
	AI_MAX_STEPS?: string;
	AI_MAX_OUTPUT_TOKENS?: string;
};

export type AiProviderInfo = {
	kind: AiProviderKind | null;
	modelId: string | null;
	models: string[];
	configured: boolean;
	mock: boolean;
	enabled: boolean;
	maxSteps: number | null;
	maxOutputTokens: number | null;
};

export type AiProvider = {
	info: AiProviderInfo;
	/** Default language model for the configured provider. */
	languageModel: LanguageModel;
	/** Resolve an allowlisted model id, or throw VALIDATION when unknown. */
	resolveModel: (modelId?: string | null) => LanguageModel;
};

const MOCK_MODEL_ID = "mock";
const MOCK_REPLY =
	"Mock AI reply. Configure AI_PROVIDER=openai-compatible with AI_BASE_URL, AI_API_KEY and AI_MODEL to use a real model.";

const parseInteger = (value: string | undefined): number | null => {
	if (!value) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseAllowlist = (value: string | undefined): string[] => {
	if (!value) return [];
	return value
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
};

const unavailable = (message: string): never => {
	throw new ApiError(ApiErrorCode.AI_NOT_CONFIGURED, message);
};

const parseKind = (value: string | undefined): AiProviderKind => {
	if (!value) return "mock";
	if (value === "mock" || value === "openai-compatible") return value;
	return unavailable(
		`Unknown AI_PROVIDER "${value}". Expected "mock" or "openai-compatible".`,
	);
};

const incomplete = (missing: string[]): never =>
	unavailable(
		`AI provider is not configured: missing ${missing.join(", ")}. Set them or use AI_PROVIDER=mock.`,
	);

/**
 * Reports provider metadata without throwing. Useful for config endpoints and
 * health checks that should surface "AI not configured" instead of a 503.
 */
export const getAiProviderInfo = (
	config: AiProviderConfig = {},
): AiProviderInfo => {
	const enabled = config.AI_ENABLED === "true";
	const maxSteps = parseInteger(config.AI_MAX_STEPS);
	const maxOutputTokens = parseInteger(config.AI_MAX_OUTPUT_TOKENS);
	const provider = config.AI_PROVIDER?.trim();
	if (provider && provider !== "mock" && provider !== "openai-compatible") {
		return {
			kind: null,
			modelId: null,
			models: [],
			configured: false,
			mock: false,
			enabled,
			maxSteps,
			maxOutputTokens,
		};
	}
	const kind: AiProviderKind =
		provider === "openai-compatible" ? "openai-compatible" : "mock";
	if (kind === "mock") {
		const modelId = config.AI_MODEL?.trim() || MOCK_MODEL_ID;
		return {
			kind,
			modelId,
			models: [modelId],
			configured: true,
			mock: true,
			enabled,
			maxSteps,
			maxOutputTokens,
		};
	}
	const baseUrl = config.AI_BASE_URL?.trim();
	const apiKey = config.AI_API_KEY?.trim();
	const modelId = config.AI_MODEL?.trim();
	const allowlist = parseAllowlist(config.AI_MODEL_ALLOWLIST);
	const configured =
		Boolean(baseUrl && apiKey && modelId) &&
		(allowlist.length === 0 || allowlist.includes(modelId ?? ""));
	return {
		kind,
		modelId: modelId ?? null,
		models: allowlist.length > 0 ? allowlist : modelId ? [modelId] : [],
		configured,
		mock: false,
		enabled,
		maxSteps,
		maxOutputTokens,
	};
};

const createMockModel = (modelId: string): LanguageModel => {
	const reply = MOCK_REPLY;
	const usage = {
		inputTokens: {
			total: 0,
			noCache: 0,
			cacheRead: 0,
			cacheWrite: 0,
		},
		outputTokens: {
			total: 8,
			text: 8,
			reasoning: 0,
		},
	};
	return new MockLanguageModelV3({
		provider: "mock",
		modelId,
		doGenerate: async () => ({
			content: [{ type: "text", text: reply }],
			finishReason: { unified: "stop", raw: "stop" },
			usage,
			warnings: [],
		}),
		doStream: async () => ({
			stream: convertArrayToReadableStream([
				{ type: "stream-start", warnings: [] },
				{ type: "text-start", id: "mock-text" },
				{ type: "text-delta", id: "mock-text", delta: reply },
				{ type: "text-end", id: "mock-text" },
				{
					type: "finish",
					finishReason: { unified: "stop", raw: "stop" },
					usage,
				},
			]),
		}),
	});
};

export const createAiProvider = (config: AiProviderConfig = {}): AiProvider => {
	const kind = parseKind(config.AI_PROVIDER?.trim());
	const info = getAiProviderInfo({ ...config, AI_PROVIDER: kind });
	const maxSteps = info.maxSteps;
	const maxOutputTokens = info.maxOutputTokens;

	if (kind === "mock") {
		const modelId = info.modelId ?? MOCK_MODEL_ID;
		const languageModel = createMockModel(modelId);
		return {
			info,
			languageModel,
			resolveModel: (requested) => {
				if (requested && requested !== modelId) {
					throw new ApiError(
						ApiErrorCode.VALIDATION,
						`Model "${requested}" is not available in mock mode. Use "${modelId}".`,
					);
				}
				return languageModel;
			},
		};
	}

	const baseUrl = config.AI_BASE_URL?.trim();
	const apiKey = config.AI_API_KEY?.trim();
	const modelId = config.AI_MODEL?.trim();
	const missing = [
		...(baseUrl ? [] : ["AI_BASE_URL"]),
		...(apiKey ? [] : ["AI_API_KEY"]),
		...(modelId ? [] : ["AI_MODEL"]),
	];
	if (missing.length > 0) {
		return incomplete(missing);
	}
	if (!info.configured) {
		return unavailable(`AI_MODEL "${modelId}" is not in AI_MODEL_ALLOWLIST.`);
	}
	const provider = createOpenAICompatible({
		name: "openai-compatible",
		baseURL: baseUrl as string,
		apiKey,
	});
	const models = info.models;
	const resolveModel = (requested?: string | null): LanguageModel => {
		const id = requested?.trim() || (modelId as string);
		if (!models.includes(id)) {
			throw new ApiError(
				ApiErrorCode.VALIDATION,
				`Model "${id}" is not allowlisted. Available models: ${models.join(", ")}.`,
			);
		}
		return provider.chatModel(id);
	};
	return {
		info: { ...info, maxSteps, maxOutputTokens },
		languageModel: resolveModel(),
		resolveModel,
	};
};
