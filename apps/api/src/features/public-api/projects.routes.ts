import { createRoute } from "@hono/zod-openapi";
import { createProjectSchema } from "@workspace/shared";
import { z } from "zod";
import { jsonError, jsonOk, projectSchema } from "./schemas";

export const listProjectsRoute = createRoute({
	method: "get",
	path: "/projects",
	responses: {
		200: jsonOk(z.array(projectSchema)),
		401: jsonError("Invalid API key"),
		429: jsonError("Rate limited"),
	},
});

export const createProjectRoute = createRoute({
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

export const getProjectRoute = createRoute({
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
