import {
	ApiError,
	ApiErrorCode,
	type DeleteObjectResponseDto,
	type PresignDownloadResponseDto,
	type PresignUploadRequestDto,
	type PresignUploadResponseDto,
} from "@workspace/shared";
import type { StorageAdapter } from "../lib/storage/types";

const MB = 1024 * 1024;

export const UPLOAD_URL_EXPIRES_IN = 600;
export const DOWNLOAD_URL_EXPIRES_IN = 300;

export const STORAGE_SCOPES = {
	avatars: {
		maxBytes: 2 * MB,
		contentTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
	},
	files: {
		maxBytes: 50 * MB,
		contentTypes: [
			"image/png",
			"image/jpeg",
			"image/webp",
			"application/pdf",
			"text/plain",
			"application/zip",
		],
	},
} as const;

export type StorageScope = keyof typeof STORAGE_SCOPES;

const OWNER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/;

const extensionOf = (filename: string) => {
	const ext = (filename.split(".").pop() ?? "").toLowerCase();
	return EXTENSION_PATTERN.test(ext) ? ext : "bin";
};

const assertOwnedKey = (key: string, ownerId: string) => {
	if (
		key.startsWith("/") ||
		key.split("/").some((part) => part === "" || part === "..")
	) {
		throw new ApiError(400, ApiErrorCode.INVALID_PARAM, "Invalid object key");
	}
	const [scope, owner] = key.split("/");
	if (!(scope in STORAGE_SCOPES) || owner !== ownerId) {
		throw new ApiError(
			403,
			ApiErrorCode.FORBIDDEN,
			"You do not have access to this object",
		);
	}
};

const requireStorage = (s3: StorageAdapter | null): StorageAdapter => {
	if (!s3) {
		throw new ApiError(
			503,
			ApiErrorCode.SERVICE_UNAVAILABLE,
			"Storage is not configured",
		);
	}
	return s3;
};

export const createStorageService = (s3: StorageAdapter | null) => ({
	presignUpload: async (
		ownerId: string,
		input: PresignUploadRequestDto,
	): Promise<PresignUploadResponseDto> => {
		const storage = requireStorage(s3);
		const rule = STORAGE_SCOPES[input.scope as StorageScope];
		if (!rule) {
			throw new ApiError(
				400,
				ApiErrorCode.INVALID_PARAM,
				`Unknown storage scope "${input.scope}"`,
			);
		}
		if (!(rule.contentTypes as readonly string[]).includes(input.contentType)) {
			throw new ApiError(
				415,
				ApiErrorCode.FILE_TYPE_NOT_ALLOWED,
				`Content type "${input.contentType}" is not allowed in scope "${input.scope}"`,
			);
		}
		if (
			!Number.isSafeInteger(input.size) ||
			input.size < 1 ||
			input.size > rule.maxBytes
		) {
			throw new ApiError(
				413,
				ApiErrorCode.FILE_TOO_LARGE,
				`File size must be between 1 byte and ${rule.maxBytes} bytes`,
			);
		}
		if (!OWNER_ID_PATTERN.test(ownerId)) {
			throw new ApiError(
				403,
				ApiErrorCode.FORBIDDEN,
				"Owner id contains characters not allowed in object keys",
			);
		}

		const key = `${input.scope}/${ownerId}/${crypto.randomUUID()}.${extensionOf(input.filename)}`;
		const uploadUrl = await storage.presignPut(
			key,
			input.contentType,
			UPLOAD_URL_EXPIRES_IN,
		);
		return {
			key,
			uploadUrl,
			publicUrl: storage.publicUrl(key),
			expiresIn: UPLOAD_URL_EXPIRES_IN,
		};
	},

	presignDownload: async (
		ownerId: string,
		key: string,
	): Promise<PresignDownloadResponseDto> => {
		const storage = requireStorage(s3);
		assertOwnedKey(key, ownerId);
		const publicUrl = storage.publicUrl(key);
		if (publicUrl) {
			return { url: publicUrl, expiresIn: 0 };
		}
		return {
			url: await storage.presignGet(key, DOWNLOAD_URL_EXPIRES_IN),
			expiresIn: DOWNLOAD_URL_EXPIRES_IN,
		};
	},

	remove: async (
		ownerId: string,
		key: string,
	): Promise<DeleteObjectResponseDto> => {
		const storage = requireStorage(s3);
		assertOwnedKey(key, ownerId);
		try {
			await storage.remove(key);
		} catch (e) {
			console.error("[storage] delete failed:", e);
			throw new ApiError(
				500,
				ApiErrorCode.STORAGE_ERROR,
				"Failed to delete object",
			);
		}
		return { key, deleted: true };
	},
});

export type StorageService = ReturnType<typeof createStorageService>;
