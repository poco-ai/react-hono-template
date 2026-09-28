import {
	ApiError,
	ApiErrorCode,
	type PresignUploadRequestDto,
} from "@workspace/shared";
import type { Context } from "hono";
import { ok } from "../lib/response";
import type { SessionEnv } from "../middleware/auth";
import type { StorageService } from "../services/storage.service";

export const createStorageController = (service: StorageService) => ({
	presignUpload: async (c: Context<SessionEnv>) => {
		const body = await c.req.json<PresignUploadRequestDto>();
		return ok(c, await service.presignUpload(c.get("session").user.id, body));
	},
	presignDownload: async (c: Context<SessionEnv>) => {
		const key = requireKey(c);
		return ok(c, await service.presignDownload(c.get("session").user.id, key));
	},
	remove: async (c: Context<SessionEnv>) => {
		const key = requireKey(c);
		return ok(c, await service.remove(c.get("session").user.id, key));
	},
});

const requireKey = (c: Context<SessionEnv>) => {
	const key = c.req.query("key");
	if (!key) {
		throw new ApiError(
			400,
			ApiErrorCode.INVALID_PARAM,
			"Missing required query param: key",
		);
	}
	return key;
};

export type StorageController = ReturnType<typeof createStorageController>;
