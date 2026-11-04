import { Hono } from "hono";
import type { Dependencies } from "./dependencies";
import type { Auth } from "./lib/auth";
import { createErrorHandler } from "./lib/on-error";
import type { SocialProvidersConfig } from "./lib/social-providers";
import { type McpConfig, resolveMcpConfig } from "./mcp/config";
import { createMcpRoutes } from "./mcp/routes";
import { requireAuth } from "./middleware/auth";
import { requireOrgMember } from "./middleware/org";
import { createActivitiesRoutes } from "./routes/activities";
import { createAdminRoutes } from "./routes/admin";
import { createAiRoutes } from "./routes/ai";
import { createApiKeysRoutes } from "./routes/api-keys";
import { createAttachmentsRoutes } from "./routes/attachments";
import { createBillingRoutes } from "./routes/billing";
import { createBootstrapRoutes } from "./routes/bootstrap";
import { createCommentsRoutes } from "./routes/comments";
import { createConfigRoutes } from "./routes/config";
import { createCyclesRoutes } from "./routes/cycles";
import { createFavoritesRoutes } from "./routes/favorites";
import { createIssueSubscriptionsRoutes } from "./routes/issue-subscriptions";
import { createIssueTemplatesRoutes } from "./routes/issue-templates";
import { createIssuesRoutes } from "./routes/issues";
import { createLabelsRoutes } from "./routes/labels";
import {
	createMediaRoutes,
	createMeMediaRoutes,
	createOrgLogoRoutes,
} from "./routes/media";
import { createNotificationsRoutes } from "./routes/notifications";
import { createOAuthRoutes } from "./routes/oauth";
import { createProjectUpdatesRoutes } from "./routes/project-updates";
import { createProjectsRoutes } from "./routes/projects";
import { createRecurrencesRoutes } from "./routes/recurrences";
import { createRelationsRoutes } from "./routes/relations";
import { createRoadmapRoutes } from "./routes/roadmap";
import { createSearchRoutes } from "./routes/search";
import { createStatusesRoutes } from "./routes/statuses";
import { createViewsRoutes } from "./routes/views";
import { createWebhooksRoutes } from "./routes/webhooks";

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
