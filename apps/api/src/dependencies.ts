import { createActivityDao } from "./dao/activity.dao";
import { createAdminUserDao } from "./dao/admin-user.dao";
import { createApiKeyDao } from "./dao/api-key.dao";
import { createAttachmentDao } from "./dao/attachment.dao";
import { createCommentDao } from "./dao/comment.dao";
import { createIssueDao } from "./dao/issue.dao";
import { createLabelDao } from "./dao/label.dao";
import { createMemberDao } from "./dao/member.dao";
import { createOrganizationDao } from "./dao/organization.dao";
import { createProjectDao } from "./dao/project.dao";
import { createSubscriptionDao } from "./dao/subscription.dao";
import { createWebhookDao } from "./dao/webhook.dao";
import { createWebhookDeliveryDao } from "./dao/webhook-delivery.dao";
import type { Database } from "./db/types";
import type { StorageAdapter } from "./lib/storage/types";
import type { StripeSetup } from "./lib/stripe";
import { createActivityService } from "./services/activity.service";
import { createAdminOrgService } from "./services/admin-org.service";
import { createAdminUserService } from "./services/admin-user.service";
import { createApiKeyService } from "./services/api-key.service";
import { createAttachmentService } from "./services/attachment.service";
import { createAuthPolicyService } from "./services/auth-policy.service";
import { createBillingService } from "./services/billing.service";
import { createBootstrapService } from "./services/bootstrap.service";
import { createCommentService } from "./services/comment.service";
import { createIssueService } from "./services/issue.service";
import { createLabelService } from "./services/label.service";
import { createPlanService } from "./services/plan.service";
import { createProjectService } from "./services/project.service";
import { createWebhookService } from "./services/webhook.service";

export const createDependencies = ({
	db,
	storage,
	stripeSetup,
	billingMockEnabled,
}: {
	db: Database;
	storage: StorageAdapter | null;
	stripeSetup: StripeSetup;
	billingMockEnabled: boolean;
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
	const subscriptionDao = createSubscriptionDao(db);
	const planService = createPlanService(subscriptionDao);

	const webhookService = createWebhookService({
		webhookDao,
		deliveryDao: webhookDeliveryDao,
		plans: planService,
	});

	const projectService = createProjectService(projectDao, planService);
	const issueService = createIssueService({
		issueDao,
		labelDao,
		projectDao,
		memberDao,
		webhooks: webhookService,
	});
	const labelService = createLabelService(labelDao);
	const commentService = createCommentService({
		commentDao,
		issueDao,
		projectDao,
		webhooks: webhookService,
	});
	const attachmentService = createAttachmentService({
		attachmentDao,
		issueDao,
		projectDao,
		storage,
		webhooks: webhookService,
		plans: planService,
	});
	const activityService = createActivityService({ activityDao, issueDao });
	const apiKeyService = createApiKeyService(apiKeyDao);
	const billingService = createBillingService({
		subscriptionDao,
		memberDao,
		projectDao,
		webhookDao,
		stripeSetup,
		mockEnabled: billingMockEnabled,
	});

	const bootstrapService = createBootstrapService(adminUserDao);
	const authPolicyService = createAuthPolicyService({
		adminUserDao,
		memberDao,
		plans: planService,
	});
	return {
		daos: { memberDao, apiKeyDao },
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
			billingService,
			planService,
			bootstrapService,
			authPolicyService,
		},
	};
};

export type Dependencies = ReturnType<typeof createDependencies>;
