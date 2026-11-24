import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { jsonError, jsonOk, labelSchema } from "./schemas";

export const listLabelsRoute = createRoute({
	method: "get",
	path: "/labels",
	responses: {
		200: jsonOk(z.array(labelSchema)),
		401: jsonError("Invalid API key"),
		429: jsonError("Rate limited"),
	},
});
