import { ApiError, ApiErrorCode } from "@workspace/shared";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createBootstrapController } from "./controllers/bootstrap.controller";
import type { Dependencies } from "./dependencies";
import type { Auth } from "./lib/auth";
import { fail, ok } from "./lib/response";
import { requireAuth } from "./middleware/auth";
import { requireOrgMember } from "./middleware/org";
import { createActivitiesRoutes } from "./routes/activities";
import { createAdminRoutes } from "./routes/admin";
import { createApiKeysRoutes } from "./routes/api-keys";
import { createAttachmentsRoutes } from "./routes/attachments";
import { createBillingRoutes } from "./routes/billing";
import { createCommentsRoutes } from "./routes/comments";
import { createIssuesRoutes } from "./routes/issues";
import { createLabelsRoutes } from "./routes/labels";
import { createProjectsRoutes } from "./routes/projects";
import { createWebhooksRoutes } from "./routes/webhooks";

export const createRoutes = ({
	auth,
	dependencies,
}: {
	auth: Auth;
	dependencies: Dependencies;
}) => {
	const bootstrapController = createBootstrapController(
		dependencies.services.bootstrapService,
	);
	return new Hono()
		.onError((err, c) => {
			if (err instanceof ApiError) {
				return fail(
					c,
					err.code,
					err.message,
					err.status as ContentfulStatusCode,
				);
			}
			console.error("[api] Unhandled error:", err);
			return fail(c, ApiErrorCode.INTERNAL_ERROR, "Internal Server Error", 500);
		})
		.get("/api/hello", (c) => ok(c, { message: "Hello from Workers API!" }))
		.get("/api/bootstrap", (c) => bootstrapController.hasAdmin(c))
		.use("/api/admin/*", requireAuth(auth))
		.route(
			"/",
			createAdminRoutes({
				users: dependencies.services.adminUserService,
				orgs: dependencies.services.adminOrgService,
			}),
		)
		.use(
			"/api/orgs/:orgId/*",
			requireAuth(auth),
			requireOrgMember(dependencies.daos.memberDao),
		)
		.route("/", createProjectsRoutes(dependencies.services.projectService))
		.route("/", createIssuesRoutes(dependencies.services.issueService))
		.route("/", createCommentsRoutes(dependencies.services.commentService))
		.route(
			"/",
			createAttachmentsRoutes(dependencies.services.attachmentService),
		)
		.route("/", createActivitiesRoutes(dependencies.services.activityService))
		.route("/", createLabelsRoutes(dependencies.services.labelService))
		.route("/", createApiKeysRoutes(dependencies.services.apiKeyService))
		.route("/", createWebhooksRoutes(dependencies.services.webhookService))
		.route("/", createBillingRoutes(dependencies.services.billingService));
};

export type AppType = ReturnType<typeof createRoutes>;
