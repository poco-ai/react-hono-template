import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "@workspace/shared";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createAiProvider } from "../src/ai/provider";
import type { AiUsageDao } from "../src/dao/ai-usage.dao";
import type { OrgAiSettingsDao } from "../src/dao/org-ai-settings.dao";
import type { OrgAiSettingsDto } from "../src/dto/ai.dto";
import type { SessionEnv } from "../src/middleware/auth";
import type { OrgEnv } from "../src/middleware/org";
import { createAiRoutes } from "../src/routes/ai";
import type { AiChatService } from "../src/services/ai-chat.service";
import type { AiConversationService } from "../src/services/ai-conversation.service";
import { createAiUsageService } from "../src/services/ai-usage.service";
import {
	createOrgAiSettingsService,
	DEFAULT_AI_SETTINGS,
} from "../src/services/org-ai-settings.service";

const ORG_ID = "org-1";
const USER_ID = "user-1";
const PROVIDER = createAiProvider({ AI_ENABLED: "true" }).info;

const setupDao = () => {
	let row: OrgAiSettingsDto | null = null;
	const dao: OrgAiSettingsDao = {
		findByOrg: async (orgId) => (row?.orgId === orgId ? row : null),
		upsert: async (orgId, patch) => {
			row = { orgId, ...patch, updatedAt: new Date().toISOString() };
			return row;
		},
	};
	return { dao, getRow: () => row };
};

const usageService = () =>
	createAiUsageService({
		usageDao: {
			sumBetween: async () => ({
				requests: 0,
				inputTokens: 0,
				outputTokens: 0,
				toolCalls: 0,
			}),
			record: async () => undefined,
		} as unknown as AiUsageDao,
	});

const appFor = (role: string) => {
	const { dao } = setupDao();
	const settings = createOrgAiSettingsService({ settingsDao: dao });
	const app = new Hono<SessionEnv & OrgEnv>();
	app.onError((err, c) =>
		err instanceof ApiError
			? c.json(
					{ ok: false, error: { code: err.code, message: err.message } },
					err.status as ContentfulStatusCode,
				)
			: c.json(
					{ ok: false, error: { code: "INTERNAL_ERROR", message: "boom" } },
					500,
				),
	);
	app.use("/api/orgs/:orgId/*", async (c, next) => {
		c.set("session", {
			user: { id: USER_ID, role: "user" },
		} as never);
		c.set("orgMember", {
			orgId: ORG_ID,
			userId: USER_ID,
			role,
			frozen: false,
		});
		await next();
	});
	app.route(
		"/",
		createAiRoutes({
			conversations: {} as AiConversationService,
			chat: {
				settingsOverview: async () => ({
					settings: await settings.get(ORG_ID),
					provider: { kind: "mock" },
					usage: {},
					enabled: true,
				}),
				usageOverview: async () => ({}),
			} as unknown as AiChatService,
			usage: usageService(),
			settings,
			plans: {
				getPlanForOrg: async () => "free",
			} as never,
			provider: PROVIDER,
		}),
	);
	return app;
};

test("AI settings default to enabled with 30-day retention", async () => {
	const { dao } = setupDao();
	const service = createOrgAiSettingsService({ settingsDao: dao });
	const settings = await service.get(ORG_ID);
	assert.equal(settings.enabled, true);
	assert.equal(settings.retentionDays, DEFAULT_AI_SETTINGS.retentionDays);
	assert.equal(settings.defaultModel, null);
	assert.equal(settings.updatedAt, null);
});

test("any member can read organization AI settings", async () => {
	const response = await appFor("member").request(
		`/api/orgs/${ORG_ID}/settings/ai`,
	);
	assert.equal(response.status, 200);
	const body = (await response.json()) as {
		ok: boolean;
		data: { settings: { enabled: boolean }; provider: { kind: string } };
	};
	assert.equal(body.ok, true);
	assert.equal(body.data.settings.enabled, true);
	assert.equal(body.data.provider.kind, "mock");
});

test("only owners and admins can update organization AI settings", async () => {
	const response = await appFor("member").request(
		`/api/orgs/${ORG_ID}/settings/ai`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ retentionDays: 7 }),
		},
	);
	assert.equal(response.status, 403);
	assert.equal(
		((await response.json()) as { error: { code: string } }).error.code,
		"FORBIDDEN",
	);
});

test("admins can update settings and models are validated against the allowlist", async () => {
	const app = appFor("admin");
	const updated = await app.request(`/api/orgs/${ORG_ID}/settings/ai`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			enabled: false,
			retentionDays: 14,
			strictMcpWrites: true,
			defaultModel: "mock",
		}),
	});
	assert.equal(updated.status, 200);
	const body = (await updated.json()) as {
		data: {
			enabled: boolean;
			retentionDays: number;
			strictMcpWrites: boolean;
			defaultModel: string;
			updatedBy: string;
		};
	};
	assert.equal(body.data.enabled, false);
	assert.equal(body.data.retentionDays, 14);
	assert.equal(body.data.strictMcpWrites, true);
	assert.equal(body.data.defaultModel, "mock");
	assert.equal(body.data.updatedBy, USER_ID);

	const invalid = await app.request(`/api/orgs/${ORG_ID}/settings/ai`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ defaultModel: "not-allowlisted" }),
	});
	assert.equal(invalid.status, 400);
	assert.equal(
		((await invalid.json()) as { error: { code: string } }).error.code,
		"VALIDATION",
	);
});
