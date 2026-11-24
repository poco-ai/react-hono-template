import { apiKeyListQuerySchema, createApiKeySchema } from "@workspace/shared";
import { Hono } from "hono";
import { apiKeyParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { requireOrgRole } from "../../../core/middleware/org";
import { createApiKeyController } from "../controllers/api-key.controller";
import type { ApiKeyService } from "../services/api-key.service";

export const createApiKeysRoutes = (service: ApiKeyService) => {
	const apiKeyController = createApiKeyController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.get(
			"/api/orgs/:orgId/api-keys",
			requireOrgRole("owner", "admin"),
			validate(apiKeyListQuerySchema, "query"),
			(c) => apiKeyController.list(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/api-keys",
			requireOrgRole("owner", "admin"),
			validate(createApiKeySchema, "json"),
			(c) => apiKeyController.create(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/api-keys/:keyId",
			requireOrgRole("owner", "admin"),
			validate(apiKeyParams, "param"),
			(c) => apiKeyController.revoke(c),
		);
};
