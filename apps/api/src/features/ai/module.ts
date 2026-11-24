import type { FeatureModule } from "../../core/compose";
import type { QuotaUsageSink } from "../../core/lib/ports/quota";
import type { FullFeatureContext } from "../../feature-context";
import type { ActivitiesContribution } from "../activities/module";
import type { BillingContribution } from "../billing/module";
import { createCapabilityLayer } from "../capabilities/index";
import type { CommentsContribution } from "../comments/module";
import type { CyclesContribution } from "../cycles/module";
import type { FavoritesContribution } from "../favorites/module";
import type { IssuesContribution } from "../issues/module";
import type { LabelsContribution } from "../labels/module";
import type { ProjectUpdatesContribution } from "../project-updates/module";
import type { ProjectsContribution } from "../projects/module";
import type { RecurrencesContribution } from "../recurrences/module";
import type { RelationsContribution } from "../relations/module";
import type { SearchContribution } from "../search/module";
import type { StatusesContribution } from "../statuses/module";
import type { TemplatesContribution } from "../templates/module";
import type { ViewsContribution } from "../views/module";
import { createAiConversationDao } from "./dao/ai-conversation.dao";
import { createAiMessageDao } from "./dao/ai-message.dao";
import { createAiToolCallDao } from "./dao/ai-tool-call.dao";
import { createAiUsageDao } from "./dao/ai-usage.dao";
import { createOrgAiSettingsDao } from "./dao/org-ai-settings.dao";
import { createAiProvider, getAiProviderInfo } from "./provider";
import { createAiRoutes } from "./routes";
import { createAiChatService } from "./services/ai-chat.service";
import { createAiConversationService } from "./services/ai-conversation.service";
import { createAiUsageService } from "./services/ai-usage.service";
import { createOrgAiSettingsService } from "./services/org-ai-settings.service";

export type AiDaos = {
	aiConversationDao: ReturnType<typeof createAiConversationDao>;
	aiMessageDao: ReturnType<typeof createAiMessageDao>;
	aiToolCallDao: ReturnType<typeof createAiToolCallDao>;
	aiUsageDao: ReturnType<typeof createAiUsageDao>;
	orgAiSettingsDao: ReturnType<typeof createOrgAiSettingsDao>;
};

/**
 * AI: chat over the capability layer, usage metering and org settings.
 * Registers last among resource features so the capability layer can see
 * every service; contributes the `ai` slot (provider info + capabilities)
 * to the dependency graph and the usage sink the quota ledger records
 * daily chat usage with.
 */
export const aiModule = {
	id: "ai",
	createDaos: ({ db }) => ({
		aiConversationDao: createAiConversationDao(db),
		aiMessageDao: createAiMessageDao(db),
		aiToolCallDao: createAiToolCallDao(db),
		aiUsageDao: createAiUsageDao(db),
		orgAiSettingsDao: createOrgAiSettingsDao(db),
	}),
	register: (ctx) => {
		const get = <T>(id: string) => ctx.features.get<T>(id);
		// The ai feature's usage sink: records daily chat usage after a quota
		// settle wins its finalize (exactly once per reservation).
		const aiUsageSink: QuotaUsageSink = async (orgId, usage) => {
			await ctx.daos.aiUsageDao.record({
				orgId,
				userId: usage.userId,
				day: new Date().toISOString().slice(0, 10),
				requests: 1,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				toolCalls: usage.toolCalls,
			});
		};
		const aiUsageService = createAiUsageService({
			usageDao: ctx.daos.aiUsageDao,
			rateLimiters: ctx.aiRateLimiters,
		});
		const orgAiSettingsService = createOrgAiSettingsService({
			settingsDao: ctx.daos.orgAiSettingsDao,
			audit: ctx.core.auditService,
		});
		const contextDaos = {
			projectDao: get<ProjectsContribution>("projects").daos.projectDao,
			issueDao: get<IssuesContribution>("issues").daos.issueDao,
		};
		const aiConversationService = createAiConversationService({
			conversationDao: ctx.daos.aiConversationDao,
			messageDao: ctx.daos.aiMessageDao,
			toolCallDao: ctx.daos.aiToolCallDao,
			contextDaos,
		});
		const capabilityLayer = createCapabilityLayer(
			{
				services: {
					organizationService: ctx.core.organizationService,
					projectService:
						get<ProjectsContribution>("projects").services.projectService,
					issueService: get<IssuesContribution>("issues").services.issueService,
					commentService:
						get<CommentsContribution>("comments").services.commentService,
					labelService: get<LabelsContribution>("labels").services.labelService,
					statusService:
						get<StatusesContribution>("statuses").services.statusService,
					activityService:
						get<ActivitiesContribution>("activities").services.activityService,
					relationService:
						get<RelationsContribution>("relations").services.relationService,
					viewService: get<ViewsContribution>("views").services.viewService,
					cycleService: get<CyclesContribution>("cycles").services.cycleService,
					projectUpdateService:
						get<ProjectUpdatesContribution>("project-updates").services
							.projectUpdateService,
					searchService:
						get<SearchContribution>("search").services.searchService,
					favoriteService:
						get<FavoritesContribution>("favorites").services.favoriteService,
					issueTemplateService:
						get<TemplatesContribution>("templates").services
							.issueTemplateService,
					recurrenceService:
						get<RecurrencesContribution>("recurrences").services
							.recurrenceService,
				},
				daos: {
					memberDao: ctx.daos.memberDao,
					organizationDao: ctx.daos.organizationDao,
					projectDao: contextDaos.projectDao,
				},
			},
			{
				isStrictMcpWrites: async (orgId) =>
					(await orgAiSettingsService.get(orgId)).strictMcpWrites,
			},
		);
		const aiProviderInfo = getAiProviderInfo(ctx.aiConfig);
		const aiChatService = createAiChatService({
			conversationService: aiConversationService,
			messageDao: ctx.daos.aiMessageDao,
			toolCallDao: ctx.daos.aiToolCallDao,
			usageService: aiUsageService,
			quota: get<BillingContribution>("billing").services.quotaService,
			settingsService: orgAiSettingsService,
			capabilityLayer,
			plans: ctx.core.planService,
			organizationDao: ctx.daos.organizationDao,
			contextDaos,
			provider: {
				info: aiProviderInfo,
				create: () => createAiProvider(ctx.aiConfig),
			},
			webBaseUrl: ctx.appWebUrl,
		});
		return {
			services: {
				aiConversationService,
				aiUsageService,
				orgAiSettingsService,
				aiChatService,
			},
			routes: [
				{
					phase: "org",
					create: () =>
						createAiRoutes({
							conversations: aiConversationService,
							chat: aiChatService,
							usage: aiUsageService,
							settings: orgAiSettingsService,
							plans: ctx.core.planService,
							provider: aiProviderInfo,
						}),
				},
			],
			// Frozen organizations keep this path: chat is read-only by
			// default — the capability executor blocks every write tool
			// while frozen.
			freezeWriteExempt: ["/ai/chat"],
			quotaUsageSinks: [aiUsageSink],
			extras: {
				ai: { provider: aiProviderInfo, capabilities: capabilityLayer },
			},
		};
	},
} satisfies FeatureModule<AiDaos, FullFeatureContext>;

export type AiContribution = ReturnType<typeof aiModule.register> & {
	daos: AiDaos;
};
