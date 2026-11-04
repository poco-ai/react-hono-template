import { OpenAPIHono } from "@hono/zod-openapi";
import {
	ApiError,
	ApiErrorCode,
	type ApiKeyScope,
	scopeSatisfies,
} from "@workspace/shared";
import type { Context } from "hono";
import type { Dependencies } from "../dependencies";
import { backgroundFromContext } from "../lib/background";
import { createErrorHandler } from "../lib/on-error";
import { fail, ok } from "../lib/response";
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

/**
 * Scope check for public API endpoints. Scopes are cumulative, so a `write`
 * key can also read and an `admin` key can do everything.
 */
const assertScope = (c: Context<V1Env>, scope: ApiKeyScope) => {
	if (!scopeSatisfies(c.get("apiKeyAuth").scopes, scope)) {
		throw new ApiError(
			ApiErrorCode.MCP_FORBIDDEN_SCOPE,
			`This endpoint requires the ${scope} API key scope.`,
		);
	}
};

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
		assertScope(c, "read");
		const orgId = c.get("apiKeyAuth").orgId;
		return ok(
			c,
			await projectService.listProjects(orgId, { includeArchived: false }),
			200,
		);
	});

	app.openapi(createProjectRoute, async (c) => {
		assertScope(c, "write");
		const orgId = c.get("apiKeyAuth").orgId;
		return ok(
			c,
			await projectService.createProject(orgId, c.req.valid("json")),
			201,
		);
	});

	app.openapi(getProjectRoute, async (c) => {
		assertScope(c, "read");
		const orgId = c.get("apiKeyAuth").orgId;
		return ok(
			c,
			await projectService.getProject(orgId, c.req.param("projectId")),
			200,
		);
	});

	app.openapi(createIssueRoute, async (c) => {
		assertScope(c, "write");
		const orgId = c.get("apiKeyAuth").orgId;
		const issue = await issueService.createIssue(
			orgId,
			c.req.param("projectId"),
			null,
			c.req.valid("json"),
			backgroundFromContext(c),
		);
		return ok(c, issue, 201);
	});

	app.openapi(listIssuesRoute, async (c) => {
		assertScope(c, "read");
		const orgId = c.get("apiKeyAuth").orgId;
		return ok(
			c,
			await issueService.listIssues(orgId, null, c.req.valid("query")),
			200,
		);
	});

	app.openapi(getIssueRoute, async (c) => {
		assertScope(c, "read");
		const orgId = c.get("apiKeyAuth").orgId;
		return ok(
			c,
			await issueService.getIssueById(orgId, c.req.param("issueId")),
			200,
		);
	});

	app.openapi(updateIssueRoute, async (c) => {
		assertScope(c, "write");
		const orgId = c.get("apiKeyAuth").orgId;
		const updated = await issueService.updateIssueById(
			orgId,
			c.req.param("issueId"),
			null,
			c.req.valid("json"),
			backgroundFromContext(c),
		);
		return ok(c, updated, 200);
	});

	app.openapi(deleteIssueRoute, async (c) => {
		assertScope(c, "write");
		const orgId = c.get("apiKeyAuth").orgId;
		await issueService.deleteIssueById(
			orgId,
			c.req.param("issueId"),
			null,
			backgroundFromContext(c),
		);
		return ok(c, { deleted: true }, 200);
	});

	app.openapi(listLabelsRoute, async (c) => {
		assertScope(c, "read");
		const orgId = c.get("apiKeyAuth").orgId;
		return ok(c, await labelService.listLabels(orgId), 200);
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
				"Public API authenticated with Bearer API keys (sk_...). All endpoints are rate limited per key. Issues expose parentId; issue relations are not exposed by this API version yet.",
		},
		servers: [{ url: "/api/v1" }],
		security: [{ bearerAuth: [] }],
	});

	app.onError(createErrorHandler("v1"));

	return app;
};

export type V1App = ReturnType<typeof createV1App>;
