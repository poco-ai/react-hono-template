import { z } from "zod";

export const createApiKeySchema = z.object({
	name: z.string().trim().min(1).max(50),
});

export const apiKeyListQuerySchema = z.object({
	page: z.coerce.number().int().min(1).max(10000).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export type ApiKeyListQuery = z.infer<typeof apiKeyListQuerySchema>;
