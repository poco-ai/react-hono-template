import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { ApiOk } from "@workspace/shared";
import {
	ApiError,
	ApiErrorCode,
	createIssueSchema,
	createProjectSchema,
	issueListQuerySchema,
	updateIssueSchema,
} from "@workspace/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod";
import { z } from "zod";
import { createApiKeyDao } from "../dao/apiKey.dao";
import { createIssueDao } from "../dao/issue.dao";
import { createLabelDao } from "../dao/label.dao";
import { createMemberDao } from "../dao/member.dao";
import { createProjectDao } from "../dao/project.dao";
import { createWebhookDao } from "../dao/webhook.dao";
import { createWebhookDeliveryDao } from "../dao/webhook-delivery.dao";
import type { Database } from "../db/types";
import { backgroundFromContext } from "../lib/background";
import { fail } from "../lib/response";
import {
	type ApiKeyEnv,
	rateLimit,
	requireApiKey,
} from "../middleware/api-key";
import { createIssueService } from "../services/issue.service";
import { createLabelService } from "../services/label.service";
import { createProjectService } from "../services/project.service";
import { createWebhookService } from "../services/webhook.service";
import {
	deletedSchema,
	issueListSchema,
	issueQuerySchema,
	issueSchema,
	jsonError,
	jsonOk,
	labelSchema,
	projectSchema,
} from "./schemas";

type V1Env = {
	Variables: ApiKeyEnv["Variables"];
};

const formatZodError = (error: ZodError) =>
	error.issues
		.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
		.join("; ");

const okV1 = <T, S extends 200 | 201>(c: Context<V1Env>, data: T, status: S) =>
	c.json<ApiOk<T>, S>({ ok: true, data }, status);

const listProjectsRoute = createRoute({
	method: "get",
	path: "/projects",
	responses: {
		200: jsonOk(z.array(projectSchema)),
		401: jsonError("Invalid API key"),
		429: jsonError("Rate limited"),
	},
});

const createProjectRoute = createRoute({
	method: "post",
	path: "/projects",
	request: {
		body: {
			content: { "application/json": { schema: createProjectSchema } },
		},
	},
	responses: {
		201: jsonOk(projectSchema),
		400: jsonError("Validation failed"),
		401: jsonError("Invalid API key"),
		429: jsonError("Rate limited"),
	},
});

const getProjectRoute = createRoute({
	method: "get",
	path: "/projects/{projectId}",
	request: {
		params: z.object({ projectId: z.string() }),
	},
	responses: {
		200: jsonOk(projectSchema),
		401: jsonError("Invalid API key"),
		404: jsonError("Project not found"),
		429: jsonError("Rate limited"),
	},
});

const createIssueRoute = createRoute({
	method: "post",
	path: "/projects/{projectId}/issues",
	request: {
		params: z.object({ projectId: z.string() }),
		body: {
			content: { "application/json": { schema: createIssueSchema } },
		},
	},
	responses: {
		201: jsonOk(issueSchema),
		400: jsonError("Validation failed"),
		401: jsonError("Invalid API key"),
		404: jsonError("Project not found"),
		429: jsonError("Rate limited"),
	},
});

const listIssuesRoute = createRoute({
	method: "get",
	path: "/issues",
	request: {
		query: issueQuerySchema,
	},
	responses: {
		200: jsonOk(issueListSchema),
		400: jsonError("Validation failed"),
		401: jsonError("Invalid API key"),
		429: jsonError("Rate limited"),
	},
});

const getIssueRoute = createRoute({
	method: "get",
	path: "/issues/{issueId}",
	request: {
		params: z.object({ issueId: z.string() }),
	},
	responses: {
		200: jsonOk(issueSchema),
		401: jsonError("Invalid API key"),
		404: jsonError("Issue not found"),
		429: jsonError("Rate limited"),
	},
});

const updateIssueRoute = createRoute({
	method: "patch",
	path: "/issues/{issueId}",
	request: {
		params: z.object({ issueId: z.string() }),
		body: {
			content: { "application/json": { schema: updateIssueSchema } },
		},
	},
	responses: {
		200: jsonOk(issueSchema),
		400: jsonError("Validation failed"),
		401: jsonError("Invalid API key"),
		404: jsonError("Issue not found"),
		429: jsonError("Rate limited"),
	},
});

const deleteIssueRoute = createRoute({
	method: "delete",
	path: "/issues/{issueId}",
	request: {
		params: z.object({ issueId: z.string() }),
	},
	responses: {
		200: jsonOk(deletedSchema),
		401: jsonError("Invalid API key"),
		404: jsonError("Issue not found"),
		429: jsonError("Rate limited"),
	},
});

const listLabelsRoute = createRoute({
	method: "get",
	path: "/labels",
	responses: {
		200: jsonOk(z.array(labelSchema)),
		401: jsonError("Invalid API key"),
		429: jsonError("Rate limited"),
	},
});

export const createV1App = ({ db }: { db: Database }) => {
	const apiKeyDao = createApiKeyDao(db);
	const projectDao = createProjectDao(db);
	const issueDao = createIssueDao(db);
	const labelDao = createLabelDao(db);
	const memberDao = createMemberDao(db);
	const webhookDao = createWebhookDao(db);
	const deliveryDao = createWebhookDeliveryDao(db);

	const webhookService = createWebhookService({ webhookDao, deliveryDao });
	const projectService = createProjectService(projectDao);
	const issueService = createIssueService({
		issueDao,
		labelDao,
		projectDao,
		memberDao,
		webhooks: webhookService,
	});
	const labelService = createLabelService(labelDao);

	const app = new OpenAPIHono<V1Env>();

	for (const base of ["/projects", "/issues", "/labels"]) {
		app.use(base, requireApiKey(apiKeyDao));
		app.use(`${base}/*`, requireApiKey(apiKeyDao));
		app.use(base, rateLimit());
		app.use(`${base}/*`, rateLimit());
	}

	app.openapi(listProjectsRoute, async (c) => {
		const orgId = c.get("apiKeyAuth").orgId;
		return okV1(
			c,
			await projectService.listProjects(orgId, { includeArchived: false }),
			200,
		);
	});

	app.openapi(createProjectRoute, async (c) => {
		const orgId = c.get("apiKeyAuth").orgId;
		return okV1(
			c,
			await projectService.createProject(orgId, c.req.valid("json")),
			201,
		);
	});

	app.openapi(getProjectRoute, async (c) => {
		const orgId = c.get("apiKeyAuth").orgId;
		return okV1(
			c,
			await projectService.getProject(orgId, c.req.param("projectId")),
			200,
		);
	});

	app.openapi(createIssueRoute, async (c) => {
		const orgId = c.get("apiKeyAuth").orgId;
		const issue = await issueService.createIssue(
			orgId,
			c.req.param("projectId"),
			null,
			c.req.valid("json"),
			backgroundFromContext(c),
		);
		return okV1(c, issue, 201);
	});

	app.openapi(listIssuesRoute, async (c) => {
		const orgId = c.get("apiKeyAuth").orgId;
		const parsed = issueListQuerySchema.safeParse(c.req.valid("query"));
		if (!parsed.success) {
			throw new ApiError(
				400,
				ApiErrorCode.VALIDATION,
				formatZodError(parsed.error),
			);
		}
		return okV1(
			c,
			await issueService.listIssues(orgId, null, parsed.data),
			200,
		);
	});

	app.openapi(getIssueRoute, async (c) => {
		const orgId = c.get("apiKeyAuth").orgId;
		return okV1(
			c,
			await issueService.getIssueById(orgId, c.req.param("issueId")),
			200,
		);
	});

	app.openapi(updateIssueRoute, async (c) => {
		const orgId = c.get("apiKeyAuth").orgId;
		const existing = await issueService.getIssueById(
			orgId,
			c.req.param("issueId"),
		);
		const updated = await issueService.updateIssue(
			orgId,
			existing.projectId,
			existing.number,
			null,
			c.req.valid("json"),
			backgroundFromContext(c),
		);
		return okV1(c, updated, 200);
	});

	app.openapi(deleteIssueRoute, async (c) => {
		const orgId = c.get("apiKeyAuth").orgId;
		const existing = await issueService.getIssueById(
			orgId,
			c.req.param("issueId"),
		);
		await issueService.deleteIssue(
			orgId,
			existing.projectId,
			existing.number,
			null,
			backgroundFromContext(c),
		);
		return okV1(c, { deleted: true }, 200);
	});

	app.openapi(listLabelsRoute, async (c) => {
		const orgId = c.get("apiKeyAuth").orgId;
		return okV1(c, await labelService.listLabels(orgId), 200);
	});

	app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
		type: "http",
		scheme: "bearer",
		description: "API key (sk_...)",
	});

	app.doc("/openapi.json", {
		openapi: "3.0.3",
		info: {
			title: "Issue Tracker Public API",
			version: "1.0.0",
			description:
				"Public API authenticated with Bearer API keys (sk_...). All endpoints are rate limited per key.",
		},
		servers: [{ url: "/api/v1" }],
		security: [{ bearerAuth: [] }],
	});

	app.onError((err, c) => {
		if (err instanceof ApiError) {
			return fail(c, err.code, err.message, err.status as ContentfulStatusCode);
		}
		if (err instanceof z.ZodError) {
			return fail(c, ApiErrorCode.VALIDATION, formatZodError(err), 400);
		}
		console.error("[v1] Unhandled error:", err);
		return fail(c, ApiErrorCode.INTERNAL_ERROR, "Internal Server Error", 500);
	});

	return app;
};

export type V1App = ReturnType<typeof createV1App>;
