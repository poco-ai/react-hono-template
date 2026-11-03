import {
	avatarPresignSchema,
	deleteMediaSchema,
	mediaRegisterSchema,
} from "@workspace/shared";
import { Hono } from "hono";
import { createMediaController } from "../controllers/media.controller";
import { validate } from "../lib/validation";
import type { SessionEnv } from "../middleware/auth";
import { type OrgEnv, requireOrgRole } from "../middleware/org";
import type { MediaService } from "../services/media.service";

export const createMediaRoutes = (service: MediaService) => {
	const media = createMediaController(service);
	return new Hono().get("/api/media/:assetId", (c) => media.get(c));
};

export const createMeMediaRoutes = (service: MediaService) => {
	const media = createMediaController(service);
	return new Hono<SessionEnv>()
		.post(
			"/api/me/avatar/presign",
			validate(avatarPresignSchema, "json"),
			(c) => media.presignAvatar(c, c.req.valid("json")),
		)
		.post("/api/me/avatar", validate(mediaRegisterSchema, "json"), (c) =>
			media.registerAvatar(c, c.req.valid("json")),
		)
		.delete("/api/me/avatar", validate(deleteMediaSchema, "json"), (c) =>
			media.deleteAvatar(c, c.req.valid("json")),
		);
};

export const createOrgLogoRoutes = (service: MediaService) => {
	const media = createMediaController(service);
	return new Hono<SessionEnv & OrgEnv>()
		.post(
			"/api/orgs/:orgId/logo/presign",
			requireOrgRole("owner", "admin"),
			validate(avatarPresignSchema, "json"),
			(c) => media.presignOrgLogo(c, c.req.valid("json")),
		)
		.post(
			"/api/orgs/:orgId/logo",
			requireOrgRole("owner", "admin"),
			validate(mediaRegisterSchema, "json"),
			(c) => media.registerOrgLogo(c, c.req.valid("json")),
		)
		.delete(
			"/api/orgs/:orgId/logo",
			requireOrgRole("owner", "admin"),
			validate(deleteMediaSchema, "json"),
			(c) => media.deleteOrgLogo(c, c.req.valid("json")),
		);
};
