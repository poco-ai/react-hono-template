import { createRoute } from "@hono/zod-openapi";
import {
	createIssueSchema,
	issueListQuerySchema,
	updateIssueSchema,
} from "@workspace/shared";
import { z } from "zod";
import {
	deletedSchema,
	issueListSchema,
	issueSchema,
	jsonError,
	jsonOk,
} from "./schemas";

export const createIssueRoute = createRoute({
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

export const listIssuesRoute = createRoute({
	method: "get",
	path: "/issues",
	request: {
		query: issueListQuerySchema,
	},
	responses: {
		200: jsonOk(issueListSchema),
		400: jsonError("Validation failed"),
		401: jsonError("Invalid API key"),
		429: jsonError("Rate limited"),
	},
});

export const getIssueRoute = createRoute({
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

export const updateIssueRoute = createRoute({
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

export const deleteIssueRoute = createRoute({
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
