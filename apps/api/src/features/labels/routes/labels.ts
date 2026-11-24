import { createLabelSchema, updateLabelSchema } from "@workspace/shared";
import { Hono } from "hono";
import { labelParams } from "../../../core/lib/params";
import { validate } from "../../../core/lib/validation";
import type { SessionEnv } from "../../../core/middleware/auth";
import type { OrgEnv } from "../../../core/middleware/org";
import { requireOrgRole } from "../../../core/middleware/org";
import { createLabelController } from "../controllers/label.controller";
import type { LabelService } from "../services/label.service";

export const createLabelsRoutes = (service: LabelService) => {
	const labelController = createLabelController(service);
	return new Hono<SessionEnv & OrgEnv>()
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
			validate(labelParams, "param"),
			validate(updateLabelSchema, "json"),
			(c) => labelController.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/labels/:labelId",
			requireOrgRole("owner", "admin"),
			validate(labelParams, "param"),
			(c) => labelController.remove(c),
		);
};
