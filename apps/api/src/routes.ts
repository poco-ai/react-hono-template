import { Hono } from "hono";
import type { Auth } from "./core/lib/auth";
import { createErrorHandler } from "./core/lib/on-error";
import type { SocialProvidersConfig } from "./core/lib/social-providers";
import { requireAuth } from "./core/middleware/auth";
import { requireOrgMember } from "./core/middleware/org";
import { createAdminRoutes } from "./core/routes/admin";
import { createAuditRoutes } from "./core/routes/audit";
import { createBootstrapRoutes } from "./core/routes/bootstrap";
import { createConfigRoutes } from "./core/routes/config";
import { createOAuthRoutes } from "./core/routes/oauth";
import type { Dependencies } from "./dependencies";
import { createActivitiesRoutes } from "./features/activities/routes/activities";
import { createAiRoutes } from "./features/ai/routes";
import { createApiKeysRoutes } from "./features/api-keys/routes/api-keys";
import { createAttachmentsRoutes } from "./features/attachments/routes/attachments";
import {
	createMediaRoutes,
	createMeMediaRoutes,
	createOrgLogoRoutes,
} from "./features/attachments/routes/media";
import { createBillingRoutes } from "./features/billing/routes/billing";
import { createCommentsRoutes } from "./features/comments/routes/comments";
import { createCyclesRoutes } from "./features/cycles/routes/cycles";
import { createFavoritesRoutes } from "./features/favorites/routes/favorites";
import { createIssuesRoutes } from "./features/issues/routes/issues";
import { createLabelsRoutes } from "./features/labels/routes/labels";
import { type McpConfig, resolveMcpConfig } from "./features/mcp/config";
import { createMcpRoutes } from "./features/mcp/routes";
import { createIssueSubscriptionsRoutes } from "./features/notifications/routes/issue-subscriptions";
import { createNotificationsRoutes } from "./features/notifications/routes/notifications";
import { createProjectUpdatesRoutes } from "./features/project-updates/routes/project-updates";
import { createProjectsRoutes } from "./features/projects/routes/projects";
import { createRecurrencesRoutes } from "./features/recurrences/routes/recurrences";
import { createRelationsRoutes } from "./features/relations/routes/relations";
import { createRoadmapRoutes } from "./features/roadmap/routes/roadmap";
import { createSearchRoutes } from "./features/search/routes/search";
import { createStatusesRoutes } from "./features/statuses/routes/statuses";
import { createIssueTemplatesRoutes } from "./features/templates/routes/issue-templates";
import { createViewsRoutes } from "./features/views/routes/views";
import { createWebhooksRoutes } from "./features/webhooks/routes/webhooks";

export const createRoutes = ({
	auth,
	dependencies,
	social,
	mcp = resolveMcpConfig(),
}: {
	auth: Auth;
	dependencies: Dependencies;
	social?: SocialProvidersConfig;
	mcp?: McpConfig;
}) => {
	return (
		new Hono()
			.onError(createErrorHandler("api"))
			.route("/", createMediaRoutes(dependencies.services.mediaService))
			.route("/", createBootstrapRoutes(dependencies.services.bootstrapService))
			.route("/", createConfigRoutes(dependencies.services.configService))
			.route("/", createOAuthRoutes(social))
			.use("/api/me/*", requireAuth(auth))
			.route("/", createMeMediaRoutes(dependencies.services.mediaService))
			.use("/api/admin/*", requireAuth(auth))
			.route(
				"/",
				createAdminRoutes({
					users: dependencies.services.adminUserService,
					orgs: dependencies.services.adminOrgService,
					config: dependencies.services.configService,
					audit: dependencies.services.auditService,
					quota: dependencies.services.quotaService,
				}),
			)
			// The authenticated org wildcard prefix is mounted before the resource
			// routes: any new resource path must live under /api/orgs/:orgId.
			// Frozen organizations keep two write paths: /billing (to manage or
			// restore the subscription) and /ai/chat (read-only by default — the
			// capability executor blocks every write tool while frozen).
			.use(
				"/api/orgs/:orgId/*",
				requireAuth(auth),
				requireOrgMember(dependencies.daos.memberDao, {
					freezeWriteExempt: ["/billing", "/ai/chat"],
				}),
			)
			// Mounted after the org middleware so /api/orgs/:orgId/mcp/* is
			// session-authenticated; a route registered before `use` bypasses it.
			.route("/", createMcpRoutes({ config: mcp }))
			.route("/", createProjectsRoutes(dependencies.services.projectService))
			.route(
				"/",
				createProjectUpdatesRoutes(dependencies.services.projectUpdateService),
			)
			.route("/", createCyclesRoutes(dependencies.services.cycleService))
			.route(
				"/",
				createRecurrencesRoutes(dependencies.services.recurrenceService),
			)
			.route("/", createRoadmapRoutes(dependencies.services.roadmapService))
			.route("/", createIssuesRoutes(dependencies.services.issueService))
			.route("/", createFavoritesRoutes(dependencies.services.favoriteService))
			.route(
				"/",
				createIssueTemplatesRoutes(dependencies.services.issueTemplateService),
			)
			.route(
				"/",
				createIssueSubscriptionsRoutes(
					dependencies.services.issueSubscriptionService,
				),
			)
			.route(
				"/",
				createNotificationsRoutes(dependencies.services.notificationService),
			)
			.route("/", createRelationsRoutes(dependencies.services.relationService))
			.route("/", createSearchRoutes(dependencies.services.searchService))
			.route("/", createCommentsRoutes(dependencies.services.commentService))
			.route(
				"/",
				createAttachmentsRoutes(dependencies.services.attachmentService),
			)
			.route("/", createOrgLogoRoutes(dependencies.services.mediaService))
			.route("/", createActivitiesRoutes(dependencies.services.activityService))
			.route("/", createLabelsRoutes(dependencies.services.labelService))
			.route("/", createStatusesRoutes(dependencies.services.statusService))
			.route("/", createViewsRoutes(dependencies.services.viewService))
			.route("/", createApiKeysRoutes(dependencies.services.apiKeyService))
			.route("/", createWebhooksRoutes(dependencies.services.webhookService))
			.route("/", createBillingRoutes(dependencies.services.billingService))
			.route("/", createAuditRoutes(dependencies.services.auditService))
			.route(
				"/",
				createAiRoutes({
					conversations: dependencies.services.aiConversationService,
					chat: dependencies.services.aiChatService,
					usage: dependencies.services.aiUsageService,
					settings: dependencies.services.orgAiSettingsService,
					plans: dependencies.services.planService,
					provider: dependencies.ai?.provider,
				}),
			)
	);
};

export type AppType = ReturnType<typeof createRoutes>;
