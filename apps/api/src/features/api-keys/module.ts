import type { FeatureModule } from "../../core/compose";
import { createApiKeyDao } from "./dao/api-key.dao";
import { createApiKeysRoutes } from "./routes/api-keys";
import { createApiKeyService } from "./services/api-key.service";

export type ApiKeysDaos = { apiKeyDao: ReturnType<typeof createApiKeyDao> };

/**
 * API keys: org-pinned bearer credentials for the public API. The key dao
 * is also consumed by the MCP endpoint's API-key auth path.
 */
export const apiKeysModule = {
	id: "api-keys",
	createDaos: ({ db }) => ({ apiKeyDao: createApiKeyDao(db) }),
	register: (ctx) => {
		const apiKeyService = createApiKeyService(
			ctx.daos.apiKeyDao,
			ctx.core.auditService,
		);
		return {
			services: { apiKeyService },
			routes: [
				{
					phase: "org",
					create: () => createApiKeysRoutes(apiKeyService),
				},
			],
		};
	},
} satisfies FeatureModule<ApiKeysDaos>;

export type ApiKeysContribution = ReturnType<typeof apiKeysModule.register> & {
	daos: ApiKeysDaos;
};
