import {
	aiChatRequestSchema,
	aiConversationListQuerySchema,
	createAiConversationSchema,
	updateAiConversationSchema,
	updateOrgAiSettingsSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import type { AiProviderInfo } from "../ai/provider";
import { createAiController } from "../controllers/ai.controller";
import { validate } from "../lib/validation";
import {
	aiChatRateLimit,
	requireAiConfigured,
	requireAiEnabled,
} from "../middleware/ai";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import { requireOrgRole } from "../middleware/org";
import type { AiChatService } from "../services/ai-chat.service";
import type { AiConversationService } from "../services/ai-conversation.service";
import type { AiUsageService } from "../services/ai-usage.service";
import type { OrgAiSettingsService } from "../services/org-ai-settings.service";
import type { PlanService } from "../services/plan.service";

export const createAiRoutes = ({
	conversations,
	chat,
	usage,
	settings,
	plans,
	provider,
}: {
	conversations: AiConversationService;
	chat: AiChatService;
	usage: AiUsageService;
	settings: OrgAiSettingsService;
	plans: PlanService;
	provider: AiProviderInfo;
}) => {
	const controller = createAiController({
		conversations,
		chat,
		usage,
		settings,
		plans,
		provider,
	});

	return new Hono<SessionEnv & OrgEnv>()
		.use("/api/orgs/:orgId/ai/*", requireAiEnabled(settings, provider))
		.post(
			"/api/orgs/:orgId/ai/chat",
			aiChatRateLimit(plans, usage),
			requireAiConfigured(provider),
			validate(aiChatRequestSchema, "json"),
			(c) => controller.chat(c, c.req.valid("json")),
		)
		.get(
			"/api/orgs/:orgId/ai/conversations",
			validate(aiConversationListQuerySchema, "query"),
			(c) => controller.listConversations(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/ai/conversations",
			validate(createAiConversationSchema, "json"),
			(c) => controller.createConversation(c, c.req.valid("json")),
		)
		.get("/api/orgs/:orgId/ai/conversations/:id", (c) =>
			controller.getConversation(c),
		)
		.patch(
			"/api/orgs/:orgId/ai/conversations/:id",
			validate(updateAiConversationSchema, "json"),
			(c) => controller.updateConversation(c, c.req.valid("json")),
		)
		.delete("/api/orgs/:orgId/ai/conversations/:id", (c) =>
			controller.deleteConversation(c),
		)
		.get("/api/orgs/:orgId/ai/usage", (c) => controller.usage(c))
		.get("/api/orgs/:orgId/settings/ai", (c) => controller.getSettings(c))
		.patch(
			"/api/orgs/:orgId/settings/ai",
			requireOrgRole("owner", "admin"),
			validate(updateOrgAiSettingsSchema, "json"),
			(c) => controller.updateSettings(c, c.req.valid("json")),
		);
};
