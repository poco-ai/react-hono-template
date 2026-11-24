import type { ApiKeyListQuery, CreateApiKeyInput } from "@workspace/shared";
import type { Context } from "hono";
import type { ApiKeyParams, ParamContext } from "../../../core/lib/params";
import { ok } from "../../../core/lib/response";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import type { ApiKeyService } from "../services/api-key.service";

type Env = SessionEnv & OrgEnv;

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

	revoke: async (c: ParamContext<ApiKeyParams>) =>
		ok(
			c,
			await service.revokeApiKey(
				c.get("orgMember").orgId,
				c.req.valid("param").keyId,
				c.get("session").user.id,
			),
		),
});
