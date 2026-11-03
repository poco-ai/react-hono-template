import type {
	AiChatRequest,
	AiConversationListQuery,
	CreateAiConversationInput,
	UpdateAiConversationInput,
	UpdateOrgAiSettingsInput,
} from "@workspace/shared";
import type { UIMessage } from "ai";
import type { Context } from "hono";
import type { AiProviderInfo } from "../ai/provider";
import { backgroundFromContext } from "../lib/background";
import { requireParam } from "../lib/params";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { AiChatService } from "../services/ai-chat.service";
import type { AiConversationService } from "../services/ai-conversation.service";
import type { AiUsageService } from "../services/ai-usage.service";
import type { OrgAiSettingsService } from "../services/org-ai-settings.service";
import type { PlanService } from "../services/plan.service";

type Env = SessionEnv & OrgEnv;

const localeFrom = (c: Context<Env>): "en" | "zh" =>
	(c.req.header("accept-language") ?? "").toLowerCase().startsWith("zh")
		? "zh"
		: "en";

export const createAiController = ({
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
}) => ({
	createConversation: async (
		c: Context<Env>,
		input: CreateAiConversationInput,
	) =>
		ok(
			c,
			await conversations.create(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				input,
			),
		),

	listConversations: async (c: Context<Env>, query: AiConversationListQuery) =>
		ok(
			c,
			await conversations.list(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				query,
			),
		),

	getConversation: async (c: Context<Env>) =>
		ok(
			c,
			await conversations.detail(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				requireParam(c, "id"),
			),
		),

	updateConversation: async (
		c: Context<Env>,
		input: UpdateAiConversationInput,
	) =>
		ok(
			c,
			await conversations.update(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				requireParam(c, "id"),
				input,
			),
		),

	deleteConversation: async (c: Context<Env>) => {
		await conversations.remove(
			c.get("orgMember").orgId,
			c.get("session").user.id,
			requireParam(c, "id"),
		);
		return ok(c, { deleted: true });
	},

	chat: async (c: Context<Env>, input: AiChatRequest) =>
		chat.chat({
			orgId: c.get("orgMember").orgId,
			userId: c.get("session").user.id,
			orgRole: c.get("orgMember").role,
			conversationId: input.conversationId,
			messages: input.messages as unknown as UIMessage[],
			context: input.context,
			timezone: input.timezone,
			locale: localeFrom(c),
			background: backgroundFromContext(c),
			abortSignal: c.req.raw.signal,
		}),

	usage: async (c: Context<Env>) => {
		const orgId = c.get("orgMember").orgId;
		const plan = await plans.getPlanForOrg(orgId);
		const [summary, orgSettings] = await Promise.all([
			usage.monthSummary(orgId, plan),
			settings.get(orgId),
		]);
		return ok(c, {
			...summary,
			provider,
			enabled: orgSettings.enabled,
		});
	},

	getSettings: async (c: Context<Env>) => {
		const orgId = c.get("orgMember").orgId;
		const plan = await plans.getPlanForOrg(orgId);
		const [orgSettings, summary] = await Promise.all([
			settings.get(orgId),
			usage.monthSummary(orgId, plan),
		]);
		return ok(c, {
			settings: orgSettings,
			provider,
			usage: summary,
			enabled: orgSettings.enabled,
		});
	},

	updateSettings: async (c: Context<Env>, input: UpdateOrgAiSettingsInput) =>
		ok(
			c,
			await settings.update(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				input,
				provider,
			),
		),
});
