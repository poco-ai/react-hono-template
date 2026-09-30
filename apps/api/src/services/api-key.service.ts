import {
	ApiError,
	ApiErrorCode,
	type ApiKeyListQuery,
	type CreateApiKeyInput,
} from "@workspace/shared";
import type { ApiKeyDao } from "../dao/api-key.dao";
import type {
	ApiKeyDto,
	ApiKeyWithSecretDto,
	ListApiKeysDto,
} from "../dto/api-key.dto";
import { randomBase64Url, sha256Hex } from "../lib/crypto";

const KEY_PREFIX = "sk_";
const KEY_PREFIX_DISPLAY_LENGTH = 8;

export const createApiKeyService = (dao: ApiKeyDao) => ({
	createApiKey: async (
		orgId: string,
		createdById: string,
		input: CreateApiKeyInput,
	): Promise<ApiKeyWithSecretDto> => {
		const key = `${KEY_PREFIX}${randomBase64Url(32)}`;
		const keyHash = await sha256Hex(key);
		const apiKey = await dao.create({
			id: crypto.randomUUID(),
			orgId,
			name: input.name,
			prefix: key.slice(0, KEY_PREFIX_DISPLAY_LENGTH),
			keyHash,
			createdById,
		});
		return { ...apiKey, key };
	},

	listApiKeys: (
		orgId: string,
		query: ApiKeyListQuery,
	): Promise<ListApiKeysDto> =>
		dao.listByOrg(orgId, query.page, query.pageSize),

	revokeApiKey: async (orgId: string, keyId: string): Promise<ApiKeyDto> => {
		const existing = await dao.findById(orgId, keyId);
		if (!existing) {
			throw new ApiError(
				404,
				ApiErrorCode.API_KEY_NOT_FOUND,
				`API key ${keyId} not found`,
			);
		}
		await dao.revoke(orgId, keyId);
		return { ...existing, revokedAt: new Date().toISOString() };
	},
});

export type ApiKeyService = ReturnType<typeof createApiKeyService>;
