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
import type { StorageAdapter } from "./lib/storage/types";
import type { StripeSetup } from "./lib/stripe";
import { createActivityService } from "./services/activity.service";
import { createAdminOrgService } from "./services/admin-org.service";
import { createAdminUserService } from "./services/admin-user.service";
import { createAiChatService } from "./services/ai-chat.service";
import { createAiConversationService } from "./services/ai-conversation.service";
import {
	type AiRateLimiters,
	createAiUsageService,
} from "./services/ai-usage.service";
import { createApiKeyService } from "./services/api-key.service";
import { createAttachmentService } from "./services/attachment.service";
import { createAuthPolicyService } from "./services/auth-policy.service";
import { createBillingService } from "./services/billing.service";
import { createBootstrapService } from "./services/bootstrap.service";
import { createCleanupService } from "./services/cleanup.service";
import { createCommentService } from "./services/comment.service";
import { createConfigService } from "./services/config.service";
import { createCycleService } from "./services/cycle.service";
import { createFavoriteService } from "./services/favorite.service";
import { createIssueService } from "./services/issue.service";
import { createIssueSubscriptionService } from "./services/issue-subscription.service";
import { createIssueTemplateService } from "./services/issue-template.service";
import { createLabelService } from "./services/label.service";
import { createMediaService } from "./services/media.service";
import { createNotificationService } from "./services/notification.service";
import { createOrgAiSettingsService } from "./services/org-ai-settings.service";
import { createPlanService } from "./services/plan.service";
import { createProjectService } from "./services/project.service";
import { createProjectUpdateService } from "./services/project-update.service";
import { createRecurrenceService } from "./services/recurrence.service";
import { createRelationService } from "./services/relation.service";
import { createRoadmapService } from "./services/roadmap.service";
import { createSearchService } from "./services/search.service";
import { createStatusService } from "./services/status.service";
import { createStorageUsageService } from "./services/storage-usage.service";
import { createViewService } from "./services/view.service";
import { createWebhookService } from "./services/webhook.service";
import {
	createWebhookDeliveryService,
	type WebhookJobQueue,
} from "./services/webhook-delivery.service";

export type RateLimiter = {
	limit: (options: { key: string }) => Promise<{ success: boolean }>;
};

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
}: {
	db: Database;
	storage: StorageAdapter | null;
	cache: CacheStore;
	stripeSetup: StripeSetup;
	billingMockEnabled: boolean;
	webhookQueue?: WebhookJobQueue | null;
	aiConfig?: AiProviderConfig;
	aiRateLimiters?: AiRateLimiters;
	apiRateLimiters?: {
		free?: RateLimiter;
		pro?: RateLimiter;
	};
	appWebUrl?: string;
	resolvePublicApiUrl?: (requestUrl: string) => string;
}) => {
	const adminUserDao = createAdminUserDao(db);
	const adminUserService = createAdminUserService(adminUserDao);

	const organizationDao = createOrganizationDao(db);
	const adminOrgService = createAdminOrgService(organizationDao);

	const memberDao = createMemberDao(db);
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
	const planService = createPlanService(billingDao, cache);

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
	});
	const cleanupService = createCleanupService({
		memberDao,
		deliveryDao: webhookDeliveryDao,
		conversationDao: aiConversationDao,
		pendingUploadDao,
		attachmentDao,
		mediaAssetDao,
		storage,
	});
	const webhookService = createWebhookService({
		webhookDao,
		deliveryDao: webhookDeliveryDao,
		plans: planService,
		deliveries: webhookDeliveryService,
	});

	const projectService = createProjectService(
		projectDao,
		planService,
		memberDao,
	);
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
	const issueService = createIssueService({
		issueDao,
		labelDao,
		projectDao,
		memberDao,
		cycleDao,
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
	const apiKeyService = createApiKeyService(apiKeyDao);
	const aiUsageService = createAiUsageService({
		usageDao: aiUsageDao,
		rateLimiters: aiRateLimiters,
	});
	const orgAiSettingsService = createOrgAiSettingsService({
		settingsDao: orgAiSettingsDao,
	});
	const contextDaos = { projectDao, issueDao };
	const aiConversationService = createAiConversationService({
		conversationDao: aiConversationDao,
		messageDao: aiMessageDao,
		toolCallDao: aiToolCallDao,
		contextDaos,
	});
	const capabilityLayer = createCapabilityLayer({
		services: {
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
	});
	const aiProviderInfo = getAiProviderInfo(aiConfig);
	const aiChatService = createAiChatService({
		conversationService: aiConversationService,
		messageDao: aiMessageDao,
		toolCallDao: aiToolCallDao,
		usageService: aiUsageService,
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
	});

	const bootstrapService = createBootstrapService(adminUserDao);
	const configService = createConfigService(cache);
	const authPolicyService = createAuthPolicyService({
		adminUserDao,
		memberDao,
		plans: planService,
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
