import {
	type AiProviderConfig,
	createAiProvider,
	getAiProviderInfo,
} from "./ai/provider";
import { createCapabilityLayer } from "./capabilities";
import { createActivityDao } from "./dao/activity.dao";
import { createAdminUserDao } from "./dao/admin-user.dao";
import { createAiConversationDao } from "./dao/ai-conversation.dao";
import { createAiMessageDao } from "./dao/ai-message.dao";
import { createAiToolCallDao } from "./dao/ai-tool-call.dao";
import { createAiUsageDao } from "./dao/ai-usage.dao";
import { createApiKeyDao } from "./dao/api-key.dao";
import { createAttachmentDao } from "./dao/attachment.dao";
import { createAuditDao } from "./dao/audit.dao";
import { createBillingDao } from "./dao/billing.dao";
import { createCommentDao } from "./dao/comment.dao";
import { createCommentMentionDao } from "./dao/comment-mention.dao";
import { createCommentReactionDao } from "./dao/comment-reaction.dao";
import { createCycleDao } from "./dao/cycle.dao";
import { createFavoriteDao } from "./dao/favorite.dao";
import { createIssueDao } from "./dao/issue.dao";
import { createIssueSubscriptionDao } from "./dao/issue-subscription.dao";
import { createIssueTemplateDao } from "./dao/issue-template.dao";
import { createLabelDao } from "./dao/label.dao";
import { createMediaAssetDao } from "./dao/media-asset.dao";
import { createMemberDao } from "./dao/member.dao";
import { createNotificationDao } from "./dao/notification.dao";
import { createOrgAiSettingsDao } from "./dao/org-ai-settings.dao";
import { createOrganizationDao } from "./dao/organization.dao";
import { createPendingUploadDao } from "./dao/pending-upload.dao";
import { createProjectDao } from "./dao/project.dao";
import { createProjectUpdateDao } from "./dao/project-update.dao";
import { createQuotaDao } from "./dao/quota.dao";
import { createRecurrenceDao } from "./dao/recurrence.dao";
import { createRelationDao } from "./dao/relation.dao";
import { createRoadmapDao } from "./dao/roadmap.dao";
import { createSearchDao } from "./dao/search.dao";
import { createStatusDao } from "./dao/status.dao";
import { createViewDao } from "./dao/view.dao";
import { createWebhookDao } from "./dao/webhook.dao";
import { createWebhookDeliveryDao } from "./dao/webhook-delivery.dao";
import type { Database } from "./db/types";
import type { CacheStore } from "./lib/kv/types";
import type { CycleGuard } from "./lib/ports/cycle-guard";
import type { QuotaUsageSink } from "./lib/ports/quota";
import type { PlanRateLimiters } from "./lib/rate-limit";
import type { StorageAdapter } from "./lib/storage/types";
import type { StripeSetup } from "./lib/stripe";
import { createActivityService } from "./services/activity.service";
import { createAdminOrgService } from "./services/admin-org.service";
import { createAdminUserService } from "./services/admin-user.service";
import { createAiChatService } from "./services/ai-chat.service";
import {
	createAiConversationCleanupHandler,
	createAiConversationService,
} from "./services/ai-conversation.service";
import {
	type AiRateLimiters,
	createAiUsageService,
} from "./services/ai-usage.service";
import { createApiKeyService } from "./services/api-key.service";
import {
	createAttachmentService,
	createStorageCleanupHandler,
} from "./services/attachment.service";
import { createAuditService } from "./services/audit.service";
import { createAuthPolicyService } from "./services/auth-policy.service";
import { createBillingService } from "./services/billing.service";
import { createBootstrapService } from "./services/bootstrap.service";
import { createCleanupService } from "./services/cleanup.service";
import { createCommentService } from "./services/comment.service";
import { createConfigService } from "./services/config.service";
import {
	assertCycleAssignable,
	createCycleService,
} from "./services/cycle.service";
import { createFavoriteService } from "./services/favorite.service";
import { createIssueService } from "./services/issue.service";
import { createIssueSubscriptionService } from "./services/issue-subscription.service";
import { createIssueTemplateService } from "./services/issue-template.service";
import { createLabelService } from "./services/label.service";
import { createMediaService } from "./services/media.service";
import {
	createNotificationCleanupHandler,
	createNotificationService,
} from "./services/notification.service";
import { createOrgAiSettingsService } from "./services/org-ai-settings.service";
import { createOrganizationService } from "./services/organization.service";
import { createPlanService } from "./services/plan.service";
import { createProjectService } from "./services/project.service";
import { createProjectUpdateService } from "./services/project-update.service";
import { createQuotaService } from "./services/quota.service";
import { createRecurrenceService } from "./services/recurrence.service";
import { createRelationService } from "./services/relation.service";
import { createRoadmapService } from "./services/roadmap.service";
import { createSearchService } from "./services/search.service";
import { createStatusService } from "./services/status.service";
import { createStorageUsageService } from "./services/storage-usage.service";
import { createViewService } from "./services/view.service";
import { createWebhookService } from "./services/webhook.service";
import {
	createWebhookCleanupHandler,
	createWebhookDeliveryService,
	type WebhookJobQueue,
} from "./services/webhook-delivery.service";

export type { PlanRateLimiters, RateLimiter } from "./lib/rate-limit";

export const createDependencies = ({
	db,
	storage,
	cache,
	stripeSetup,
	billingMockEnabled,
	webhookQueue = null,
	aiConfig = {},
	aiRateLimiters,
	apiRateLimiters,
	appWebUrl = "http://localhost:5173",
	resolvePublicApiUrl = (requestUrl: string) => new URL(requestUrl).origin,
	allowFirstUserAdmin = false,
}: {
	db: Database;
	storage: StorageAdapter | null;
	cache: CacheStore;
	stripeSetup: StripeSetup;
	billingMockEnabled: boolean;
	webhookQueue?: WebhookJobQueue | null;
	aiConfig?: AiProviderConfig;
	aiRateLimiters?: AiRateLimiters;
	apiRateLimiters?: PlanRateLimiters;
	appWebUrl?: string;
	resolvePublicApiUrl?: (requestUrl: string) => string;
	allowFirstUserAdmin?: boolean;
}) => {
	const adminUserDao = createAdminUserDao(db);
	const adminUserService = createAdminUserService(adminUserDao);

	const organizationDao = createOrganizationDao(db);
	const adminOrgService = createAdminOrgService(organizationDao);

	const memberDao = createMemberDao(db);
	const organizationService = createOrganizationService({
		organizationDao,
		memberDao,
	});
	const projectDao = createProjectDao(db);
	const projectUpdateDao = createProjectUpdateDao(db);
	const cycleDao = createCycleDao(db);
	const roadmapDao = createRoadmapDao(db);
	const issueDao = createIssueDao(db);
	const favoriteDao = createFavoriteDao(db);
	const issueTemplateDao = createIssueTemplateDao(db);
	const recurrenceDao = createRecurrenceDao(db);
	const relationDao = createRelationDao(db);
	const labelDao = createLabelDao(db);
	const statusDao = createStatusDao(db);
	const viewDao = createViewDao(db);
	const commentDao = createCommentDao(db);
	const commentReactionDao = createCommentReactionDao(db);
	const commentMentionDao = createCommentMentionDao(db);
	const issueSubscriptionDao = createIssueSubscriptionDao(db);
	const notificationDao = createNotificationDao(db);
	const attachmentDao = createAttachmentDao(db);
	const pendingUploadDao = createPendingUploadDao(db);
	const mediaAssetDao = createMediaAssetDao(db);
	const activityDao = createActivityDao(db);
	const apiKeyDao = createApiKeyDao(db);
	const webhookDao = createWebhookDao(db);
	const webhookDeliveryDao = createWebhookDeliveryDao(db);
	const billingDao = createBillingDao(db);
	const aiConversationDao = createAiConversationDao(db);
	const aiMessageDao = createAiMessageDao(db);
	const aiToolCallDao = createAiToolCallDao(db);
	const aiUsageDao = createAiUsageDao(db);
	const orgAiSettingsDao = createOrgAiSettingsDao(db);
	// DB-backed plan source: the subscription row is billing's only input to
	// plan resolution (a trimmed preset wires createStaticPlanSource instead).
	const planService = createPlanService(
		{
			load: async (orgId) => {
				const subscription = await billingDao.findByOrg(orgId);
				return subscription.plan === "pro" ? "pro" : "free";
			},
		},
		cache,
	);
	const auditService = createAuditService(createAuditDao(db));
	// The ai feature's usage sink: records daily chat usage after a quota
	// settle wins its finalize (exactly once per reservation).
	const aiUsageSink: QuotaUsageSink = async (orgId, usage) => {
		await aiUsageDao.record({
			orgId,
			userId: usage.userId,
			day: new Date().toISOString().slice(0, 10),
			requests: 1,
			inputTokens: usage.inputTokens,
			outputTokens: usage.outputTokens,
			toolCalls: usage.toolCalls,
		});
	};
	const quotaService = createQuotaService({
		dao: createQuotaDao(db),
		plans: planService,
		audit: auditService,
		usageSinks: [aiUsageSink],
	});

	const searchService = createSearchService(createSearchDao(db));

	const webhookDeliveryService = createWebhookDeliveryService({
		webhookDao,
		deliveryDao: webhookDeliveryDao,
		queue: webhookQueue,
	});
	const mediaService = createMediaService({
		mediaAssetDao,
		pendingUploadDao,
		storage,
		resolvePublicApiUrl,
	});
	const storageUsageService = createStorageUsageService({
		attachmentDao,
		pendingUploadDao,
		mediaAssetDao,
		plans: planService,
		quota: quotaService,
	});
	const cleanupService = createCleanupService({
		memberDao,
		// Feature cleanup contributions in the historical count order, so the
		// cron log key layout is unchanged.
		handlers: [
			createWebhookCleanupHandler(webhookDeliveryDao),
			createAiConversationCleanupHandler(aiConversationDao),
			createNotificationCleanupHandler(notificationDao),
			createStorageCleanupHandler({
				pendingUploadDao,
				attachmentDao,
				mediaAssetDao,
				storage,
				quota: quotaService,
			}),
		],
	});
	const webhookService = createWebhookService({
		webhookDao,
		deliveryDao: webhookDeliveryDao,
		plans: planService,
		deliveries: webhookDeliveryService,
		audit: auditService,
	});

	const projectService = createProjectService({
		projectDao,
		plans: planService,
		memberDao,
	});
	const projectUpdateService = createProjectUpdateService({
		updateDao: projectUpdateDao,
		projectDao,
	});
	const cycleService = createCycleService({ cycleDao, projectDao });
	const roadmapService = createRoadmapService({ roadmapDao });
	const viewService = createViewService({
		viewDao,
		projectDao,
		plans: planService,
	});
	const statusService = createStatusService(statusDao);
	const notificationService = createNotificationService({
		notificationDao,
		subscriptionDao: issueSubscriptionDao,
	});
	// Cycle guard adapter: the planning feature's validation wrapped for the
	// issue service port (absent in presets without cycles).
	const cycleGuard: CycleGuard = {
		assertCycleAssignable: (orgId, projectId, cycleId) =>
			assertCycleAssignable(cycleDao, orgId, projectId, cycleId),
		findById: (orgId, cycleId) => cycleDao.findById(orgId, cycleId),
		listAllByProject: (orgId, projectId) =>
			cycleDao.listAllByProject(orgId, projectId),
	};
	const issueService = createIssueService({
		issueDao,
		labelDao,
		projectDao,
		memberDao,
		cycleGuard,
		statusService,
		webhooks: webhookDeliveryService,
		notifications: notificationService,
	});
	const labelService = createLabelService(labelDao, cache);
	const recurrenceService = createRecurrenceService({
		recurrenceDao,
		issueDao,
		projectDao,
		labelDao,
		memberDao,
		statusService,
		notifications: notificationService,
		webhooks: webhookDeliveryService,
	});
	const favoriteService = createFavoriteService({
		favoriteDao,
		issueDao,
		projectDao,
	});
	const issueTemplateService = createIssueTemplateService({
		templateDao: issueTemplateDao,
		projectDao,
		statusDao,
		labelDao,
	});
	const relationService = createRelationService({
		relationDao,
		issueDao,
		projectDao,
		webhooks: webhookDeliveryService,
	});
	const attachmentService = createAttachmentService({
		attachmentDao,
		issueDao,
		projectDao,
		commentDao,
		pendingUploadDao,
		storage,
		webhooks: webhookDeliveryService,
		plans: planService,
		storageUsage: storageUsageService,
	});
	const commentService = createCommentService({
		commentDao,
		issueDao,
		projectDao,
		webhooks: webhookDeliveryService,
		files: attachmentService,
		notifications: notificationService,
		memberDao,
		reactionDao: commentReactionDao,
		mentionDao: commentMentionDao,
	});
	const issueSubscriptionService = createIssueSubscriptionService({
		issueDao,
		subscriptionDao: issueSubscriptionDao,
	});
	const activityService = createActivityService({ activityDao, issueDao });
	const apiKeyService = createApiKeyService(apiKeyDao, auditService);
	const aiUsageService = createAiUsageService({
		usageDao: aiUsageDao,
		rateLimiters: aiRateLimiters,
	});
	const orgAiSettingsService = createOrgAiSettingsService({
		settingsDao: orgAiSettingsDao,
		audit: auditService,
	});
	const contextDaos = { projectDao, issueDao };
	const aiConversationService = createAiConversationService({
		conversationDao: aiConversationDao,
		messageDao: aiMessageDao,
		toolCallDao: aiToolCallDao,
		contextDaos,
	});
	const capabilityLayer = createCapabilityLayer(
		{
			services: {
				organizationService,
				projectService,
				issueService,
				commentService,
				labelService,
				statusService,
				activityService,
				relationService,
				viewService,
				cycleService,
				projectUpdateService,
				searchService,
				favoriteService,
				issueTemplateService,
				recurrenceService,
			},
			daos: {
				memberDao,
				organizationDao,
				projectDao,
			},
		},
		{
			isStrictMcpWrites: async (orgId) =>
				(await orgAiSettingsService.get(orgId)).strictMcpWrites,
		},
	);
	const aiProviderInfo = getAiProviderInfo(aiConfig);
	const aiChatService = createAiChatService({
		conversationService: aiConversationService,
		messageDao: aiMessageDao,
		toolCallDao: aiToolCallDao,
		usageService: aiUsageService,
		quota: quotaService,
		settingsService: orgAiSettingsService,
		capabilityLayer,
		plans: planService,
		organizationDao,
		contextDaos,
		provider: {
			info: aiProviderInfo,
			create: () => createAiProvider(aiConfig),
		},
		webBaseUrl: appWebUrl,
	});
	const billingService = createBillingService({
		billingDao,
		memberDao,
		projectDao,
		webhookDao,
		stripeSetup,
		mockEnabled: billingMockEnabled,
		plans: planService,
		storageUsage: storageUsageService,
		quota: quotaService,
		audit: auditService,
	});

	const bootstrapService = createBootstrapService(adminUserDao);
	const configService = createConfigService(cache);
	const authPolicyService = createAuthPolicyService({
		adminUserDao,
		memberDao,
		organizationDao,
		plans: planService,
		allowFirstUserAdmin,
	});
	return {
		apiRateLimiters,
		daos: {
			memberDao,
			apiKeyDao,
			organizationDao,
			projectDao,
			projectUpdateDao,
			cycleDao,
			issueDao,
			favoriteDao,
			issueTemplateDao,
			recurrenceDao,
			relationDao,
			commentDao,
			labelDao,
			statusDao,
			activityDao,
			aiConversationDao,
			aiMessageDao,
			aiToolCallDao,
			aiUsageDao,
			orgAiSettingsDao,
			issueSubscriptionDao,
			notificationDao,
			commentReactionDao,
			commentMentionDao,
		},
		ai: {
			provider: aiProviderInfo,
			capabilities: capabilityLayer,
		},
		services: {
			adminUserService,
			adminOrgService,
			organizationService,
			projectService,
			projectUpdateService,
			cycleService,
			roadmapService,
			viewService,
			issueService,
			labelService,
			favoriteService,
			issueTemplateService,
			recurrenceService,
			statusService,
			commentService,
			issueSubscriptionService,
			attachmentService,
			relationService,
			mediaService,
			activityService,
			searchService,
			notificationService,
			apiKeyService,
			webhookService,
			webhookDeliveryService,
			cleanupService,
			billingService,
			planService,
			quotaService,
			auditService,
			bootstrapService,
			configService,
			authPolicyService,
			aiConversationService,
			aiUsageService,
			orgAiSettingsService,
			aiChatService,
		},
	};
};

export type Dependencies = ReturnType<typeof createDependencies>;
