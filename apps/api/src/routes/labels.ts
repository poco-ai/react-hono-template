import { createLabelSchema, updateLabelSchema } from "@workspace/shared";
import { Hono } from "hono";
import { createLabelController } from "../controllers/label.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import { requireOrgRole } from "../middleware/org";
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
			validate(updateLabelSchema, "json"),
			(c) => labelController.update(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/labels/:labelId",
			requireOrgRole("owner", "admin"),
			(c) => labelController.remove(c),
		);
};
