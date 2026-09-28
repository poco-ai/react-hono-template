import { ApiErrorCode } from "@workspace/shared";
import { createMiddleware } from "hono/factory";
import type { ApiKeyDao } from "../dao/apiKey.dao";
import { backgroundFromContext } from "../lib/background";
import { sha256Hex } from "../lib/crypto";
import { checkRateLimit, DEFAULT_RATE_LIMIT } from "../lib/rate-limit";
import { fail } from "../lib/response";

const TOUCH_THROTTLE_MS = 60_000;

export type ApiKeyAuth = {
	orgId: string;
	keyId: string;
	keyHash: string;
};

export type ApiKeyEnv = {
	Variables: {
		apiKeyAuth: ApiKeyAuth;
	};
};

export const requireApiKey = (apiKeyDao: ApiKeyDao) =>
	createMiddleware<ApiKeyEnv>(async (c, next) => {
		const header = c.req.header("authorization") ?? "";
		const token = header.toLowerCase().startsWith("bearer ")
			? header.slice(7).trim()
			: null;
		if (!token) {
			c.header("WWW-Authenticate", 'Bearer realm="api"');
			return fail(c, ApiErrorCode.UNAUTHORIZED, "Invalid API key", 401);
		}
		const keyHash = await sha256Hex(token);
		const apiKey = await apiKeyDao.findByHash(keyHash);
		if (!apiKey || apiKey.revokedAt) {
			c.header("WWW-Authenticate", 'Bearer realm="api"');
			return fail(c, ApiErrorCode.UNAUTHORIZED, "Invalid API key", 401);
		}
		c.set("apiKeyAuth", {
			orgId: apiKey.orgId,
			keyId: apiKey.id,
			keyHash,
		});
		const lastUsedMs = apiKey.lastUsedAt
			? new Date(apiKey.lastUsedAt).getTime()
			: 0;
		if (Date.now() - lastUsedMs > TOUCH_THROTTLE_MS) {
			backgroundFromContext(c)(() => apiKeyDao.touchLastUsed(apiKey.id));
		}
		await next();
	});

export const rateLimit = (limitPerMin: number = DEFAULT_RATE_LIMIT) =>
	createMiddleware<ApiKeyEnv>(async (c, next) => {
		const key = c.get("apiKeyAuth")?.keyHash ?? "anonymous";
		const result = checkRateLimit(key, limitPerMin);
		c.header("X-RateLimit-Limit", String(limitPerMin));
		c.header("X-RateLimit-Remaining", String(result.remaining));
		c.header("X-RateLimit-Reset", String(result.resetAfterSeconds));
		if (!result.allowed) {
			c.header("Retry-After", String(result.retryAfterSeconds));
			return fail(
				c,
				ApiErrorCode.RATE_LIMITED,
				`Rate limit exceeded: max ${limitPerMin} requests per minute`,
				429,
			);
		}
		await next();
	});
