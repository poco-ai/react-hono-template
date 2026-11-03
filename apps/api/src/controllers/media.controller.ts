import type {
	AvatarPresignInput,
	DeleteMediaInput,
	MediaRegisterInput,
} from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { OrgEnv } from "../middleware/org";
import type { MediaService } from "../services/media.service";

const PUBLIC_MEDIA_CACHE = "public, max-age=31536000, immutable";

export const createMediaController = (service: MediaService) => ({
	presignAvatar: async (c: Context<SessionEnv>, input: AvatarPresignInput) =>
		ok(c, await service.presignAvatar(c.get("session").user.id, input)),

	registerAvatar: async (c: Context<SessionEnv>, input: MediaRegisterInput) =>
		ok(
			c,
			await service.registerAvatar(c.get("session").user.id, input, c.req.url),
		),

	deleteAvatar: async (c: Context<SessionEnv>, input: DeleteMediaInput) =>
		ok(c, await service.deleteAvatar(c.get("session").user.id, input.url)),

	presignOrgLogo: async (
		c: Context<SessionEnv & OrgEnv>,
		input: AvatarPresignInput,
	) =>
		ok(
			c,
			await service.presignOrgLogo(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				input,
			),
		),

	registerOrgLogo: async (
		c: Context<SessionEnv & OrgEnv>,
		input: MediaRegisterInput,
	) =>
		ok(
			c,
			await service.registerOrgLogo(
				c.get("orgMember").orgId,
				c.get("session").user.id,
				input,
				c.req.url,
			),
		),

	deleteOrgLogo: async (
		c: Context<SessionEnv & OrgEnv>,
		input: DeleteMediaInput,
	) => ok(c, await service.deleteOrgLogo(c.get("orgMember").orgId, input.url)),

	get: async (c: Context) => {
		const media = await service.getMedia(c.req.param("assetId") ?? "");
		const headers: Record<string, string> = {
			"Content-Type": media.contentType,
			"Cache-Control": PUBLIC_MEDIA_CACHE,
			"X-Content-Type-Options": "nosniff",
		};
		if (media.contentLength !== null) {
			headers["Content-Length"] = String(media.contentLength);
		}
		if (media.etag) {
			headers.ETag = media.etag;
		}
		return c.body(media.body, 200, headers);
	},
});
