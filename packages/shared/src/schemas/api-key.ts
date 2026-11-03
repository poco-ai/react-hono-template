import { z } from "zod";
import { API_KEY_SCOPES } from "../api-key-scopes";
import { paginationQueryShape } from "./pagination";

export const createApiKeySchema = z.object({
	name: z.string().trim().min(1).max(50),
	/**
	 * Cumulative API key scopes. Omitted scopes default to `["read", "write"]`
	 * so existing callers keep their current access; `admin` must be requested
	 * explicitly.
	 */
	scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(3).optional(),
});

export const apiKeyListQuerySchema = z.object({
	...paginationQueryShape(20),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export type ApiKeyListQuery = z.infer<typeof apiKeyListQuerySchema>;
