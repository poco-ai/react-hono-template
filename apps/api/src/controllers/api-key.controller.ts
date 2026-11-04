import type { ApiKeyListQuery, CreateApiKeyInput } from "@workspace/shared";
import type { Context } from "hono";
import { requireParamValue } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { ApiKeyService } from "../services/api-key.service";

type Env = SessionEnv & OrgEnv;

const requireKeyId = (c: Context<Env>) =>
	requireParamValue(c.req.param("keyId"), "keyId");

export const createApiKeyController = (service: ApiKeyService) => ({
	list: async (c: Context<Env>, query: ApiKeyListQuery) =>
		ok(c, await service.listApiKeys(c.get("orgMember").orgId, query)),

	create: async (c: Context<Env>, input: CreateApiKeyInput) =>
		ok(
			c,
			await service.createApiKey(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				input,
			),
		),

	revoke: async (c: Context<Env>) =>
		ok(
			c,
			await service.revokeApiKey(c.get("orgMember").orgId, requireKeyId(c)),
		),
});
