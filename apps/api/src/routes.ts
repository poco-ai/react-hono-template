import {
	ApiError,
	ApiErrorCode,
	createIssueSchema,
	createLabelSchema,
	createProjectSchema,
	issueListQuerySchema,
	type PresignUploadRequestDto,
	updateIssueSchema,
	updateLabelSchema,
	updateProjectSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { validator } from "hono/validator";
import type { ZodType } from "zod";
import { createAdminController } from "./controllers/admin-user.controller";
import { createIssueController } from "./controllers/issue.controller";
import { createLabelController } from "./controllers/label.controller";
import { createProjectController } from "./controllers/project.controller";
import { createStorageController } from "./controllers/storage.controller";
import { createAdminUserDao } from "./dao/admin-user.dao";
import { createIssueDao } from "./dao/issue.dao";
import { createLabelDao } from "./dao/label.dao";
import { createMemberDao } from "./dao/member.dao";
import { createProjectDao } from "./dao/project.dao";
import type { Database } from "./db/types";
import type {
	BanAdminUserDto,
	UpdateAdminUserRoleDto,
} from "./dto/admin-user.dto";
import type { Auth } from "./lib/auth";
import { fail, ok } from "./lib/response";
import type { StorageAdapter } from "./lib/storage/types";
import { requireAuth, requirePermission } from "./middleware/auth";
import { requireOrgMember, requireOrgRole } from "./middleware/org";
import { createAdminUserService } from "./services/admin-user.service";
import { createIssueService } from "./services/issue.service";
import { createLabelService } from "./services/label.service";
import { createProjectService } from "./services/project.service";
import { createStorageService } from "./services/storage.service";

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
}: {
	db: Database;
	auth: Auth;
	storage: StorageAdapter | null;
}) => {
	const adminUserDao = createAdminUserDao(db);
	const adminUserService = createAdminUserService(adminUserDao);
	const adminController = createAdminController(adminUserService);

	const storageService = createStorageService(storage);
	const storageController = createStorageController(storageService);

	const memberDao = createMemberDao(db);
	const projectDao = createProjectDao(db);
	const issueDao = createIssueDao(db);
	const labelDao = createLabelDao(db);

	const projectService = createProjectService(projectDao);
	const issueService = createIssueService({
		issueDao,
		labelDao,
		projectDao,
		memberDao,
	});
	const labelService = createLabelService(labelDao);

	const projectController = createProjectController(projectService);
	const issueController = createIssueController(issueService);
	const labelController = createLabelController(labelService);

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
			"/api/orgs/:orgId/issues",
			validate(issueListQuerySchema, "query"),
			(c) => issueController.listByOrg(c, c.req.valid("query")),
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
		);
};

export type AppType = ReturnType<typeof createRoutes>;
