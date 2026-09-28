import type { apiKeys } from "../db/schema";

type ApiKeyRow = typeof apiKeys.$inferSelect;

export type ApiKeyDto = Omit<
	ApiKeyRow,
	"keyHash" | "createdAt" | "updatedAt" | "lastUsedAt" | "revokedAt"
> & {
	lastUsedAt: string | null;
	revokedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type ApiKeyWithSecretDto = ApiKeyDto & {
	key: string;
};

export type ListApiKeysDto = {
	items: ApiKeyDto[];
	total: number;
	page: number;
	pageSize: number;
};
