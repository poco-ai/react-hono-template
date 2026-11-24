import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { fail } from "./response";
import { formatZodError } from "./validation";

/**
 * Shared error mapping for every Hono surface — the main API (`routes.ts`),
 * the public v1 API and the top-level app (`index.ts`, covering Stripe,
 * MCP and auth handlers). `ApiError`s keep their code and registry status;
 * stray `ZodError`s become 400 VALIDATION; anything else is logged and
 * answered with a generic 500 that never leaks internals.
 */
export const createErrorHandler =
	(label: string) => (err: unknown, c: Context) => {
		if (err instanceof ApiError) {
			return fail(c, err.code, err.message, err.status as ContentfulStatusCode);
		}
		if (err instanceof z.ZodError) {
			return fail(c, ApiErrorCode.VALIDATION, formatZodError(err), 400);
		}
		console.error(`[${label}] Unhandled error:`, err);
		return fail(c, ApiErrorCode.INTERNAL_ERROR, "Internal Server Error", 500);
	};
