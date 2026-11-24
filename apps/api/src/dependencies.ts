import { createActivityDao } from "./core/dao/activity.dao";
import { createAdminUserDao } from "./core/dao/admin-user.dao";
import { createAuditDao } from "./core/dao/audit.dao";
import { createMemberDao } from "./core/dao/member.dao";
import { createOrganizationDao } from "./core/dao/organization.dao";
import type { CacheStore } from "./core/lib/kv/types";
import type { CycleGuard } from "./core/lib/ports/cycle-guard";
import type { QuotaUsageSink } from "./core/lib/ports/quota";
import type { PlanRateLimiters } from "./core/lib/rate-limit";
import { createAdminOrgService } from "./core/services/admin-org.service";
import { createAdminUserService } from "./core/services/admin-user.service";
import { createAuditService } from "./core/services/audit.service";
import { createAuthPolicyService } from "./core/services/auth-policy.service";
import { createBootstrapService } from "./core/services/bootstrap.service";
import { createCleanupService } from "./core/services/cleanup.service";
import { createConfigService } from "./core/services/config.service";
import { createOrganizationService } from "./core/services/organization.service";
import type { Database } from "./db/types";
import { createActivityService } from "./features/activities/services/activity.service";
import { createAiConversationDao } from "./features/ai/dao/ai-conversation.dao";
import { createAiMessageDao } from "./features/ai/dao/ai-message.dao";
import { createAiToolCallDao } from "./features/ai/dao/ai-tool-call.dao";
import { createAiUsageDao } from "./features/ai/dao/ai-usage.dao";
import { createOrgAiSettingsDao } from "./features/ai/dao/org-ai-settings.dao";
import {
	type AiProviderConfig,
	createAiProvider,
	getAiProviderInfo,
} from "./features/ai/provider";
import { createAiChatService } from "./features/ai/services/ai-chat.service";
import {
	createAiConversationCleanupHandler,
	createAiConversationService,
} from "./features/ai/services/ai-conversation.service";
import {
	type AiRateLimiters,
	createAiUsageService,
} from "./features/ai/services/ai-usage.service";
import { createOrgAiSettingsService } from "./features/ai/services/org-ai-settings.service";
import { createApiKeyDao } from "./features/api-keys/dao/api-key.dao";
import { createApiKeyService } from "./features/api-keys/services/api-key.service";
import { createAttachmentDao } from "./features/attachments/dao/attachment.dao";
import { createMediaAssetDao } from "./features/attachments/dao/media-asset.dao";
import { createPendingUploadDao } from "./features/attachments/dao/pending-upload.dao";
import type { StorageAdapter } from "./features/attachments/lib/types";
import {
	createAttachmentService,
	createStorageCleanupHandler,
} from "./features/attachments/services/attachment.service";
import { createMediaService } from "./features/attachments/services/media.service";
import { createBillingDao } from "./features/billing/dao/billing.dao";
import { createQuotaDao } from "./features/billing/dao/quota.dao";
import type { StripeSetup } from "./features/billing/lib/stripe";
import { createBillingService } from "./features/billing/services/billing.service";
import { createPlanService } from "./features/billing/services/plan.service";
import { createQuotaService } from "./features/billing/services/quota.service";
import { createStorageUsageService } from "./features/billing/services/storage-usage.service";
import { createCapabilityLayer } from "./features/capabilities/index";
import { createCommentDao } from "./features/comments/dao/comment.dao";
import { createCommentMentionDao } from "./features/comments/dao/comment-mention.dao";
import { createCommentReactionDao } from "./features/comments/dao/comment-reaction.dao";
import { createCommentService } from "./features/comments/services/comment.service";
import { createCycleDao } from "./features/cycles/dao/cycle.dao";
import {
	assertCycleAssignable,
	createCycleService,
} from "./features/cycles/services/cycle.service";
import { createFavoriteDao } from "./features/favorites/dao/favorite.dao";
import { createFavoriteService } from "./features/favorites/services/favorite.service";
import { createIssueDao } from "./features/issues/dao/issue.dao";
import { createIssueService } from "./features/issues/services/issue.service";
import { createLabelDao } from "./features/labels/dao/label.dao";
import { createLabelService } from "./features/labels/services/label.service";
import { createIssueSubscriptionDao } from "./features/notifications/dao/issue-subscription.dao";
import { createNotificationDao } from "./features/notifications/dao/notification.dao";
import { createIssueSubscriptionService } from "./features/notifications/services/issue-subscription.service";
import {
	createNotificationCleanupHandler,
	createNotificationService,
} from "./features/notifications/services/notification.service";
import { createProjectUpdateDao } from "./features/project-updates/dao/project-update.dao";
import { createProjectUpdateService } from "./features/project-updates/services/project-update.service";
import { createProjectDao } from "./features/projects/dao/project.dao";
import { createProjectService } from "./features/projects/services/project.service";
import { createRecurrenceDao } from "./features/recurrences/dao/recurrence.dao";
import { createRecurrenceService } from "./features/recurrences/services/recurrence.service";
import { createRelationDao } from "./features/relations/dao/relation.dao";
import { createRelationService } from "./features/relations/services/relation.service";
import { createRoadmapDao } from "./features/roadmap/dao/roadmap.dao";
import { createRoadmapService } from "./features/roadmap/services/roadmap.service";
import { createSearchDao } from "./features/search/dao/search.dao";
import { createSearchService } from "./features/search/services/search.service";
import { createStatusDao } from "./features/statuses/dao/status.dao";
import { createStatusService } from "./features/statuses/services/status.service";
import { createIssueTemplateDao } from "./features/templates/dao/issue-template.dao";
import { createIssueTemplateService } from "./features/templates/services/issue-template.service";
import { createViewDao } from "./features/views/dao/view.dao";
import { createViewService } from "./features/views/services/view.service";
import { createWebhookDao } from "./features/webhooks/dao/webhook.dao";
import { createWebhookDeliveryDao } from "./features/webhooks/dao/webhook-delivery.dao";
import { createWebhookService } from "./features/webhooks/services/webhook.service";
import {
	createWebhookCleanupHandler,
	createWebhookDeliveryService,
	type WebhookJobQueue,
} from "./features/webhooks/services/webhook-delivery.service";

export type { PlanRateLimiters, RateLimiter } from "./core/lib/rate-limit";

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
