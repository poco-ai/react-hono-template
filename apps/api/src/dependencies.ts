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
import { createIssueDao } from "./dao/issue.dao";
import { createLabelDao } from "./dao/label.dao";
import { createMemberDao } from "./dao/member.dao";
import { createOrgAiSettingsDao } from "./dao/org-ai-settings.dao";
import { createOrganizationDao } from "./dao/organization.dao";
import { createProjectDao } from "./dao/project.dao";
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
import { createIssueService } from "./services/issue.service";
import { createLabelService } from "./services/label.service";
import { createOrgAiSettingsService } from "./services/org-ai-settings.service";
import { createPlanService } from "./services/plan.service";
import { createProjectService } from "./services/project.service";
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
}) => {
	const adminUserDao = createAdminUserDao(db);
	const adminUserService = createAdminUserService(adminUserDao);

	const organizationDao = createOrganizationDao(db);
	const adminOrgService = createAdminOrgService(organizationDao);

	const memberDao = createMemberDao(db);
	const projectDao = createProjectDao(db);
	const issueDao = createIssueDao(db);
	const labelDao = createLabelDao(db);
	const commentDao = createCommentDao(db);
	const attachmentDao = createAttachmentDao(db);
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

	const webhookDeliveryService = createWebhookDeliveryService({
		webhookDao,
		deliveryDao: webhookDeliveryDao,
		queue: webhookQueue,
	});
	const cleanupService = createCleanupService({
		memberDao,
		deliveryDao: webhookDeliveryDao,
		conversationDao: aiConversationDao,
	});
	const webhookService = createWebhookService({
		webhookDao,
		deliveryDao: webhookDeliveryDao,
		plans: planService,
		deliveries: webhookDeliveryService,
	});

	const projectService = createProjectService(projectDao, planService);
	const issueService = createIssueService({
		issueDao,
		labelDao,
		projectDao,
		memberDao,
		webhooks: webhookDeliveryService,
	});
	const labelService = createLabelService(labelDao, cache);
	const commentService = createCommentService({
		commentDao,
		issueDao,
		projectDao,
		webhooks: webhookDeliveryService,
	});
	const attachmentService = createAttachmentService({
		attachmentDao,
		issueDao,
		projectDao,
		storage,
		webhooks: webhookDeliveryService,
		plans: planService,
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
			activityService,
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
			issueDao,
			commentDao,
			labelDao,
			activityDao,
			aiConversationDao,
			aiMessageDao,
			aiToolCallDao,
			aiUsageDao,
			orgAiSettingsDao,
		},
		ai: {
			provider: aiProviderInfo,
			capabilities: capabilityLayer,
		},
		services: {
			adminUserService,
			adminOrgService,
			projectService,
			issueService,
			labelService,
			commentService,
			attachmentService,
			activityService,
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
