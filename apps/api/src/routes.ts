import {
	ApiError,
	ApiErrorCode,
	activityListQuerySchema,
	adminOrgListQuerySchema,
	apiKeyListQuerySchema,
	attachmentPresignSchema,
	commentListQuerySchema,
	createApiKeySchema,
	createCommentSchema,
	createIssueSchema,
	createLabelSchema,
	createProjectSchema,
	createWebhookSchema,
	issueListQuerySchema,
	type PresignUploadRequestDto,
	registerAttachmentSchema,
	updateIssueSchema,
	updateLabelSchema,
	updateProjectSchema,
	updateWebhookSchema,
	webhookDeliveryListQuerySchema,
} from "@workspace/shared";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { validator } from "hono/validator";
import type { ZodType } from "zod";
import { createActivityController } from "./controllers/activity.controller";
import { createAdminOrgController } from "./controllers/admin-org.controller";
import { createAdminController } from "./controllers/admin-user.controller";
import { createApiKeyController } from "./controllers/apikey.controller";
import { createAttachmentController } from "./controllers/attachment.controller";
import { createBillingController } from "./controllers/billing.controller";
import { createCommentController } from "./controllers/comment.controller";
import { createIssueController } from "./controllers/issue.controller";
import { createLabelController } from "./controllers/label.controller";
import { createProjectController } from "./controllers/project.controller";
import { createStorageController } from "./controllers/storage.controller";
import { createWebhookController } from "./controllers/webhook.controller";
import { createActivityDao } from "./dao/activity.dao";
import { createAdminUserDao } from "./dao/admin-user.dao";
import { createApiKeyDao } from "./dao/apiKey.dao";
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
import type {
	BanAdminUserDto,
	UpdateAdminUserRoleDto,
} from "./dto/admin-user.dto";
import type { Auth } from "./lib/auth";
import { createPlanService } from "./lib/plan";
import { fail, ok } from "./lib/response";
import type { StorageAdapter } from "./lib/storage/types";
import type { StripeContext } from "./lib/stripe";
import { requireAuth, requirePermission } from "./middleware/auth";
import { requireOrgMember, requireOrgRole } from "./middleware/org";
import { createActivityService } from "./services/activity.service";
import { createAdminOrgService } from "./services/admin-org.service";
import { createAdminUserService } from "./services/admin-user.service";
import { createApiKeyService } from "./services/apikey.service";
import { createAttachmentService } from "./services/attachment.service";
import { createBillingService } from "./services/billing.service";
import { createCommentService } from "./services/comment.service";
import { createIssueService } from "./services/issue.service";
import { createLabelService } from "./services/label.service";
import { createProjectService } from "./services/project.service";
import { createStorageService } from "./services/storage.service";
import { createWebhookService } from "./services/webhook.service";

const formatZodError = (error: {
	issues: { path: PropertyKey[]; message: string }[];
}) =>
	error.issues
		.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
		.join("; ");

const validate = <T, const S extends "json" | "query">(
	schema: ZodType<T>,
	source: S,
) =>
	validator(source, (value) => {
		const result = schema.safeParse(value);
		if (result.error) {
			throw new ApiError(
				400,
				ApiErrorCode.VALIDATION,
				formatZodError(result.error),
			);
		}
		return result.data as T;
	});

export const createRoutes = ({
	db,
	auth,
	storage,
	stripe,
}: {
	db: Database;
	auth: Auth;
	storage: StorageAdapter | null;
	stripe: StripeContext | null;
}) => {
	const adminUserDao = createAdminUserDao(db);
	const adminUserService = createAdminUserService(adminUserDao);
	const adminController = createAdminController(adminUserService);

	const organizationDao = createOrganizationDao(db);
	const adminOrgService = createAdminOrgService(organizationDao);
	const adminOrgController = createAdminOrgController(adminOrgService);

	const storageService = createStorageService(storage);
	const storageController = createStorageController(storageService);

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
		stripe,
	});

	const projectController = createProjectController(projectService);
	const issueController = createIssueController(issueService);
	const labelController = createLabelController(labelService);
	const commentController = createCommentController(commentService);
	const attachmentController = createAttachmentController(attachmentService);
	const activityController = createActivityController(activityService);
	const apiKeyController = createApiKeyController(apiKeyService);
	const webhookController = createWebhookController(webhookService);
	const billingController = createBillingController({
		service: billingService,
		memberDao,
	});

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
		.use("/api/storage/*", requireAuth(auth))
		.post(
			"/api/storage/presign",
			validator("json", (value) => value as PresignUploadRequestDto),
			(c) => storageController.presignUpload(c),
		)
		.get("/api/storage/download", (c) => storageController.presignDownload(c))
		.delete("/api/storage/objects", (c) => storageController.remove(c))
		.use("/api/admin/*", requireAuth(auth))
		.get("/api/admin/users", requirePermission({ user: ["list"] }), (c) =>
			adminController.list(c),
		)
		.patch(
			"/api/admin/users/:id/role",
			requirePermission({ user: ["set-role"] }),
			validator("json", (value) => value as UpdateAdminUserRoleDto),
			(c) => adminController.updateRole(c),
		)
		.post(
			"/api/admin/users/:id/ban",
			requirePermission({ user: ["ban"] }),
			validator("json", (value) => value as BanAdminUserDto),
			(c) => adminController.ban(c),
		)
		.delete(
			"/api/admin/users/:id/ban",
			requirePermission({ user: ["ban"] }),
			(c) => adminController.unban(c),
		)
		.get(
			"/api/admin/orgs",
			requirePermission({ org: ["list"] }),
			validate(adminOrgListQuerySchema, "query"),
			(c) => adminOrgController.list(c, c.req.valid("query")),
		)
		.post(
			"/api/admin/orgs/:orgId/freeze",
			requirePermission({ org: ["freeze"] }),
			(c) => adminOrgController.freeze(c),
		)
		.delete(
			"/api/admin/orgs/:orgId/freeze",
			requirePermission({ org: ["freeze"] }),
			(c) => adminOrgController.unfreeze(c),
		)
		.get("/api/admin/stats", requirePermission({ org: ["stats"] }), (c) =>
			adminOrgController.stats(c),
		)
		.use("/api/orgs/:orgId/*", requireAuth(auth), requireOrgMember(memberDao))
		.get("/api/orgs/:orgId/projects", (c) => projectController.list(c))
		.post(
			"/api/orgs/:orgId/projects",
			requireOrgRole("owner", "admin"),
			validate(createProjectSchema, "json"),
			(c) => projectController.create(c, c.req.valid("json")),
		)
		.get("/api/orgs/:orgId/projects/:projectId", (c) =>
			projectController.get(c),
		)
		.patch(
			"/api/orgs/:orgId/projects/:projectId",
			requireOrgRole("owner", "admin"),
			validate(updateProjectSchema, "json"),
			(c) => projectController.update(c, c.req.valid("json")),
		)
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues",
			validate(issueListQuerySchema, "query"),
			(c) => issueController.listByProject(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues",
			validate(createIssueSchema, "json"),
			(c) => issueController.create(c, c.req.valid("json")),
		)
		.get("/api/orgs/:orgId/projects/:projectId/issues/:number", (c) =>
			issueController.get(c),
		)
		.patch(
			"/api/orgs/:orgId/projects/:projectId/issues/:number",
			validate(updateIssueSchema, "json"),
			(c) => issueController.update(c, c.req.valid("json")),
		)
		.delete("/api/orgs/:orgId/projects/:projectId/issues/:number", (c) =>
			issueController.remove(c),
		)
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments",
			validate(commentListQuerySchema, "query"),
			(c) => commentController.list(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments",
			validate(createCommentSchema, "json"),
			(c) => commentController.create(c, c.req.valid("json")),
		)
		.patch(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId",
			validate(createCommentSchema, "json"),
			(c) => commentController.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/comments/:commentId",
			(c) => commentController.remove(c),
		)
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/attachments",
			(c) => attachmentController.list(c),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/attachments",
			validate(registerAttachmentSchema, "json"),
			(c) => attachmentController.register(c, c.req.valid("json")),
		)
		.post(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/attachments/presign",
			validate(attachmentPresignSchema, "json"),
			(c) => attachmentController.presign(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/attachments/:attachmentId",
			(c) => attachmentController.remove(c),
		)
		.get(
			"/api/orgs/:orgId/projects/:projectId/issues/:number/activities",
			(c) => activityController.listByIssue(c),
		)
		.get(
			"/api/orgs/:orgId/issues",
			validate(issueListQuerySchema, "query"),
			(c) => issueController.listByOrg(c, c.req.valid("query")),
		)
		.get(
			"/api/orgs/:orgId/activities",
			validate(activityListQuerySchema, "query"),
			(c) => activityController.listByOrg(c, c.req.valid("query")),
		)
		.get("/api/orgs/:orgId/labels", (c) => labelController.list(c))
		.post(
			"/api/orgs/:orgId/labels",
			requireOrgRole("owner", "admin"),
			validate(createLabelSchema, "json"),
			(c) => labelController.create(c, c.req.valid("json")),
		)
		.patch(
			"/api/orgs/:orgId/labels/:labelId",
			requireOrgRole("owner", "admin"),
			validate(updateLabelSchema, "json"),
			(c) => labelController.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/labels/:labelId",
			requireOrgRole("owner", "admin"),
			(c) => labelController.remove(c),
		)
		.get(
			"/api/orgs/:orgId/api-keys",
			requireOrgRole("owner", "admin"),
			validate(apiKeyListQuerySchema, "query"),
			(c) => apiKeyController.list(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/api-keys",
			requireOrgRole("owner", "admin"),
			validate(createApiKeySchema, "json"),
			(c) => apiKeyController.create(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/api-keys/:keyId",
			requireOrgRole("owner", "admin"),
			(c) => apiKeyController.revoke(c),
		)
		.get("/api/orgs/:orgId/webhooks", requireOrgRole("owner", "admin"), (c) =>
			webhookController.list(c),
		)
		.post(
			"/api/orgs/:orgId/webhooks",
			requireOrgRole("owner", "admin"),
			validate(createWebhookSchema, "json"),
			(c) => webhookController.create(c, c.req.valid("json")),
		)
		.patch(
			"/api/orgs/:orgId/webhooks/:webhookId",
			requireOrgRole("owner", "admin"),
			validate(updateWebhookSchema, "json"),
			(c) => webhookController.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/webhooks/:webhookId",
			requireOrgRole("owner", "admin"),
			(c) => webhookController.remove(c),
		)
		.get(
			"/api/orgs/:orgId/webhooks/:webhookId/deliveries",
			requireOrgRole("owner", "admin"),
			validate(webhookDeliveryListQuerySchema, "query"),
			(c) => webhookController.listDeliveries(c, c.req.valid("query")),
		)
		.get(
			"/api/orgs/:orgId/webhook-deliveries",
			requireOrgRole("owner", "admin"),
			validate(webhookDeliveryListQuerySchema, "query"),
			(c) => webhookController.listOrgDeliveries(c, c.req.valid("query")),
		)
		.post(
			"/api/orgs/:orgId/webhooks/:webhookId/ping",
			requireOrgRole("owner", "admin"),
			(c) => webhookController.ping(c),
		)
		.post(
			"/api/orgs/:orgId/webhook-deliveries/:deliveryId/redeliver",
			requireOrgRole("owner", "admin"),
			(c) => webhookController.redeliver(c),
		)
		.get("/api/orgs/:orgId/billing", requireOrgRole("owner", "admin"), (c) =>
			billingController.get(c),
		)
		.post(
			"/api/orgs/:orgId/billing/checkout",
			requireOrgRole("owner", "admin"),
			(c) => billingController.checkout(c),
		)
		.post(
			"/api/orgs/:orgId/billing/portal",
			requireOrgRole("owner", "admin"),
			(c) => billingController.portal(c),
		);
};

export type AppType = ReturnType<typeof createRoutes>;
