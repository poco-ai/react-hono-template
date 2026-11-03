import {
	ApiError,
	ApiErrorCode,
	type AvatarPresignInput,
	MEDIA_IMAGE_TYPES,
	MEDIA_MAX_SIZE,
	type MediaRegisterInput,
} from "@workspace/shared";
import type { MediaAssetDao } from "../dao/media-asset.dao";
import type { PendingUploadDao } from "../dao/pending-upload.dao";
import type { StorageAdapter } from "../lib/storage/types";
import { MEDIA_KINDS, PENDING_UPLOAD_TTL_MS } from "../lib/storage/uploads";

const PUBLIC_MEDIA_KINDS = new Set<string>(MEDIA_KINDS);
const IMAGE_TYPES = new Set<string>(MEDIA_IMAGE_TYPES);

export type MediaObject = {
	body: ReadableStream;
	contentType: string;
	contentLength: number | null;
	etag: string | null;
};

export type RegisteredMedia = {
	assetId: string;
	url: string;
};

export type PresignedMedia = {
	key: string;
	uploadUrl: string;
	expiresIn: number;
};

const UPLOAD_URL_EXPIRES_IN = 600;

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const extensionFor = (contentType: string) => {
	if (contentType === "image/jpeg") return "jpg";
	if (contentType === "image/png") return "png";
	if (contentType === "image/webp") return "webp";
	throw new ApiError(
		415,
		ApiErrorCode.UNSUPPORTED_MEDIA_TYPE,
		`Content type "${contentType}" is not allowed`,
	);
};

const assetIdFromUrl = (url: string) => {
	const match = url.match(/\/api\/media\/([A-Za-z0-9_-]{8,80})(?:[/?#]|$)/);
	return match?.[1] ?? null;
};

const requireStorage = (storage: StorageAdapter | null): StorageAdapter => {
	if (!storage) {
		throw new ApiError(
			503,
			ApiErrorCode.SERVICE_UNAVAILABLE,
			"Storage is not configured",
		);
	}
	return storage;
};

const assertImage = (contentType: string, size: number) => {
	if (!IMAGE_TYPES.has(contentType)) {
		throw new ApiError(
			415,
			ApiErrorCode.UNSUPPORTED_MEDIA_TYPE,
			`Content type "${contentType}" is not allowed`,
		);
	}
	if (!Number.isSafeInteger(size) || size < 1 || size > MEDIA_MAX_SIZE) {
		throw new ApiError(
			413,
			ApiErrorCode.FILE_TOO_LARGE,
			`Image size must be between 1 byte and ${MEDIA_MAX_SIZE} bytes`,
		);
	}
};

export const createMediaService = ({
	mediaAssetDao,
	pendingUploadDao,
	storage,
	resolvePublicApiUrl,
}: {
	mediaAssetDao: MediaAssetDao;
	pendingUploadDao: PendingUploadDao;
	storage: StorageAdapter | null;
	resolvePublicApiUrl: (requestUrl: string) => string;
}) => {
	const mediaUrl = (assetId: string, requestUrl: string) =>
		`${trimSlash(resolvePublicApiUrl(requestUrl))}/api/media/${assetId}`;

	const reserve = async ({
		kind,
		orgId,
		userId,
		key,
		assetId,
		input,
	}: {
		kind: "avatar" | "org_logo";
		orgId: string | null;
		userId: string;
		key: string;
		assetId: string;
		input: AvatarPresignInput;
	}): Promise<PresignedMedia> => {
		const s3 = requireStorage(storage);
		assertImage(input.contentType, input.size);
		await pendingUploadDao.create({
			id: crypto.randomUUID(),
			key,
			kind,
			orgId,
			userId,
			targetId: assetId,
			declaredSize: input.size,
			contentType: input.contentType,
			expiresAt: new Date(Date.now() + PENDING_UPLOAD_TTL_MS),
		});
		try {
			const uploadUrl = await s3.presignPut(
				key,
				input.contentType,
				UPLOAD_URL_EXPIRES_IN,
				input.size,
			);
			return { key, uploadUrl, expiresIn: UPLOAD_URL_EXPIRES_IN };
		} catch (error) {
			await pendingUploadDao.deleteByKey(key).catch((deleteError) => {
				console.error(
					"[media] failed to drop pending upload after presign error:",
					deleteError,
				);
			});
			throw error;
		}
	};

	const registerReserved = async ({
		kind,
		orgId,
		userId,
		expectedPrefix,
		input,
		requestUrl,
	}: {
		kind: "avatar" | "org_logo";
		orgId: string | null;
		userId: string;
		expectedPrefix: string;
		input: MediaRegisterInput;
		requestUrl: string;
	}): Promise<RegisteredMedia> => {
		const pending = await pendingUploadDao.findByKey(input.key);
		if (
			!pending ||
			pending.expiresAt.getTime() <= Date.now() ||
			pending.userId !== userId ||
			pending.kind !== kind ||
			pending.orgId !== orgId ||
			!pending.targetId ||
			!input.key.startsWith(expectedPrefix)
		) {
			throw new ApiError(
				400,
				ApiErrorCode.UPLOAD_NOT_PENDING,
				"Upload was not reserved or has expired",
			);
		}
		assertImage(pending.contentType, pending.declaredSize);
		const s3 = requireStorage(storage);
		const stat = await s3.stat(input.key);
		if (!stat) {
			throw new ApiError(
				400,
				ApiErrorCode.STORAGE_ERROR,
				"No uploaded object found for this key",
			);
		}
		if (stat.size > MEDIA_MAX_SIZE || stat.size > pending.declaredSize) {
			throw new ApiError(
				413,
				ApiErrorCode.FILE_TOO_LARGE,
				`Uploaded object is ${stat.size} bytes, exceeding the reserved limit`,
			);
		}
		if (stat.contentType && !stat.contentType.startsWith(pending.contentType)) {
			throw new ApiError(
				415,
				ApiErrorCode.UNSUPPORTED_MEDIA_TYPE,
				"Uploaded object content type does not match the reserved upload",
			);
		}
		const existing = await mediaAssetDao.findByKey(input.key);
		if (existing) {
			throw new ApiError(
				409,
				ApiErrorCode.CONFLICT,
				"This object has already been registered",
			);
		}
		const now = new Date();
		const asset = await mediaAssetDao.register({
			asset: {
				id: pending.targetId,
				orgId,
				ownerUserId: userId,
				kind,
				key: input.key,
				filename: null,
				contentType: pending.contentType,
				size: stat.size,
			},
			supersede: kind === "avatar" ? { userId } : { orgId: orgId ?? "" },
			pendingKey: input.key,
			now,
		});
		return { assetId: asset.id, url: mediaUrl(asset.id, requestUrl) };
	};

	return {
		presignAvatar: async (
			userId: string,
			input: AvatarPresignInput,
		): Promise<PresignedMedia> => {
			assertImage(input.contentType, input.size);
			const assetId = crypto.randomUUID();
			const key = `users/${userId}/avatars/${assetId}.${extensionFor(input.contentType)}`;
			return reserve({
				kind: "avatar",
				orgId: null,
				userId,
				key,
				assetId,
				input,
			});
		},

		registerAvatar: async (
			userId: string,
			input: MediaRegisterInput,
			requestUrl: string,
		): Promise<RegisteredMedia> =>
			registerReserved({
				kind: "avatar",
				orgId: null,
				userId,
				expectedPrefix: `users/${userId}/avatars/`,
				input,
				requestUrl,
			}),

		deleteAvatar: async (userId: string, url: string) => {
			const assetId = assetIdFromUrl(url);
			if (!assetId) {
				throw new ApiError(
					400,
					ApiErrorCode.VALIDATION,
					"Avatar URL does not reference a media asset",
				);
			}
			const asset = await mediaAssetDao.findById(assetId);
			if (asset?.kind !== "avatar" || asset.ownerUserId !== userId) {
				throw new ApiError(
					404,
					ApiErrorCode.ASSET_NOT_FOUND,
					"Avatar not found",
				);
			}
			if (storage) {
				try {
					await storage.remove(asset.key);
				} catch (error) {
					console.error("[media] avatar delete failed:", error);
				}
			}
			await mediaAssetDao.deleteById(asset.id);
			return { deleted: true };
		},

		presignOrgLogo: async (
			orgId: string,
			userId: string,
			input: AvatarPresignInput,
		): Promise<PresignedMedia> => {
			assertImage(input.contentType, input.size);
			const assetId = crypto.randomUUID();
			const key = `orgs/${orgId}/logo/${assetId}.${extensionFor(input.contentType)}`;
			return reserve({
				kind: "org_logo",
				orgId,
				userId,
				key,
				assetId,
				input,
			});
		},

		registerOrgLogo: async (
			orgId: string,
			userId: string,
			input: MediaRegisterInput,
			requestUrl: string,
		): Promise<RegisteredMedia> =>
			registerReserved({
				kind: "org_logo",
				orgId,
				userId,
				expectedPrefix: `orgs/${orgId}/logo/`,
				input,
				requestUrl,
			}),

		deleteOrgLogo: async (orgId: string, url: string) => {
			const assetId = assetIdFromUrl(url);
			if (!assetId) {
				throw new ApiError(
					400,
					ApiErrorCode.VALIDATION,
					"Logo URL does not reference a media asset",
				);
			}
			const asset = await mediaAssetDao.findById(assetId);
			if (asset?.kind !== "org_logo" || asset.orgId !== orgId) {
				throw new ApiError(
					404,
					ApiErrorCode.ASSET_NOT_FOUND,
					"Organization logo not found",
				);
			}
			if (storage) {
				try {
					await storage.remove(asset.key);
				} catch (error) {
					console.error("[media] logo delete failed:", error);
				}
			}
			await mediaAssetDao.deleteById(asset.id);
			return { deleted: true };
		},

		getMedia: async (assetId: string): Promise<MediaObject> => {
			const asset = await mediaAssetDao.findById(assetId);
			if (!asset || !PUBLIC_MEDIA_KINDS.has(asset.kind)) {
				throw new ApiError(
					404,
					ApiErrorCode.ASSET_NOT_FOUND,
					"Media not found",
				);
			}
			const s3 = requireStorage(storage);
			const object = await s3.get(asset.key);
			if (!object) {
				throw new ApiError(
					404,
					ApiErrorCode.ASSET_NOT_FOUND,
					"Media not found",
				);
			}
			return {
				body: object.body,
				contentType: asset.contentType,
				contentLength: object.contentLength ?? asset.size,
				etag: object.etag,
			};
		},
	};
};

export type MediaService = ReturnType<typeof createMediaService>;
