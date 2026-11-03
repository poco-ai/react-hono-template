import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApiKeyDao, ApiKeyInsert } from "../src/dao/api-key.dao";
import type { ApiKeyDto } from "../src/dto/api-key.dto";
import { createApiKeyService } from "../src/services/api-key.service";

const ORG_ID = "org-1";
const USER_ID = "user-1";
const NOW = "2026-01-01T00:00:00.000Z";

const setup = () => {
	const created: ApiKeyInsert[] = [];
	const dao = {
		create: async (data: ApiKeyInsert): Promise<ApiKeyDto> => {
			created.push(data);
			return {
				id: data.id,
				orgId: data.orgId,
				name: data.name,
				prefix: data.prefix,
				scopes: data.scopes,
				createdById: data.createdById,
				lastUsedAt: null,
				revokedAt: null,
				createdAt: NOW,
				updatedAt: NOW,
			};
		},
	} as unknown as ApiKeyDao;
	return { service: createApiKeyService(dao), created };
};

test("new general API keys default to read and write", async () => {
	const { service, created } = setup();
	await service.createApiKey(ORG_ID, USER_ID, { name: "CI" });
	assert.deepEqual(created[0]?.scopes, ["read", "write"]);
});

test("admin scope must be requested explicitly", async () => {
	const { service, created } = setup();
	const key = await service.createApiKey(ORG_ID, USER_ID, {
		name: "Admin",
		scopes: ["admin"],
	});
	assert.deepEqual(created[0]?.scopes, ["admin"]);
	assert.deepEqual(key.scopes, ["admin"]);
});

test("requested scopes are normalized and de-duplicated", async () => {
	const { service, created } = setup();
	await service.createApiKey(ORG_ID, USER_ID, {
		name: "Scoped",
		scopes: ["write", "read", "write"],
	});
	assert.deepEqual(created[0]?.scopes, ["read", "write"]);
});
