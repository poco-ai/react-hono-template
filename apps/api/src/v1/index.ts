import { OpenAPIHono } from "@hono/zod-openapi";
import type { ApiOk } from "@workspace/shared";
import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { Dependencies } from "../dependencies";
import { backgroundFromContext } from "../lib/background";
import { fail } from "../lib/response";
import { formatZodError } from "../lib/validation";
import {
	type ApiKeyEnv,
	forbidFrozenOrg,
	rateLimit,
	requireApiKey,
} from "../middleware/api-key";
import {
	createIssueRoute,
	deleteIssueRoute,
	getIssueRoute,
	listIssuesRoute,
	updateIssueRoute,
} from "./issues.routes";
import { listLabelsRoute } from "./labels.routes";
import {
	createProjectRoute,
	getProjectRoute,
	listProjectsRoute,
} from "./projects.routes";

type V1Env = {
	Variables: ApiKeyEnv["Variables"];
};

const okV1 = <T, S extends 200 | 201>(c: Context<V1Env>, data: T, status: S) =>
	c.json<ApiOk<T>, S>({ ok: true, data }, status);

export const createV1App = (dependencies: Dependencies) => {
	const { apiKeyDao, memberDao } = dependencies.daos;
	const { planService, projectService, issueService, labelService } =
		dependencies.services;

	// Validation failures (query/body/params) are answered with the same
	// `{ ok: false, error }` envelope the routes document, instead of the
	// framework's raw ZodError payload.
	const app = new OpenAPIHono<V1Env>({
		defaultHook: (result, c) =>
			result.success
				? undefined
				: fail(c, ApiErrorCode.VALIDATION, formatZodError(result.error), 400),
	});
	const rateLimiter = rateLimit(planService);

	for (const base of ["/projects", "/issues", "/labels"]) {
		app.use(`${base}/*`, requireApiKey(apiKeyDao));
		app.use(`${base}/*`, rateLimiter);
		app.use(`${base}/*`, forbidFrozenOrg(memberDao));
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
		return okV1(
			c,
			await issueService.listIssues(orgId, null, c.req.valid("query")),
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
