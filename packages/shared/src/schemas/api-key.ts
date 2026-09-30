import { z } from "zod";
import { paginationQueryShape } from "./pagination";

export const createApiKeySchema = z.object({
	name: z.string().trim().min(1).max(50),
});

export const apiKeyListQuerySchema = z.object({
	...paginationQueryShape(20),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export type ApiKeyListQuery = z.infer<typeof apiKeyListQuerySchema>;
