/**
 * Structural read surface for MCP API-key authentication. The MCP feature may
 * ship without the api-keys feature (it is a soft dependency), so this type
 * stands in for `features/api-keys/dao/api-key.dao` instead of importing it.
 */
export type ApiKeyRecord = {
	id: string;
	orgId: string;
	scopes: string[];
	revokedAt: Date | null;
	lastUsedAt: Date | null;
	createdById: string | null;
};

export type ApiKeyLookup = {
	findByHash: (hash: string) => Promise<ApiKeyRecord | null>;
	touchLastUsed: (id: string) => Promise<void>;
};
