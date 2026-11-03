import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode, MEDIA_MAX_SIZE } from "@workspace/shared";
import type { MediaAssetDao, MediaAssetRow } from "../src/dao/media-asset.dao";
import type {
	PendingUploadDao,
	PendingUploadRow,
} from "../src/dao/pending-upload.dao";
import type { StorageAdapter } from "../src/lib/storage/types";
import { createMediaService } from "../src/services/media.service";

const harness = ({
	presignPut,
}: {
	presignPut?: StorageAdapter["presignPut"];
} = {}) => {
	const pending: PendingUploadRow[] = [];
	const assets: MediaAssetRow[] = [];
	const objects = new Map<
		string,
		{ size: number; contentType: string | null; body: ReadableStream }
	>();
	const removed: string[] = [];
	const pendingUploadDao = {
		create: async (data: Omit<PendingUploadRow, "createdAt">) => {
			pending.push({ ...data, createdAt: new Date() });
		},
		findByKey: async (key: string) =>
			pending.find((row) => row.key === key) ?? null,
		deleteByKey: async (key: string) => {
			const index = pending.findIndex((row) => row.key === key);
			if (index >= 0) pending.splice(index, 1);
		},
		findExpired: async () => [],
		sumDeclaredSizeByOrg: async () => 0,
		countByTarget: async () => 0,
	} as PendingUploadDao;
	const mediaAssetDao = {
		create: async (data: Omit<MediaAssetRow, "supersededAt" | "createdAt">) => {
			const row: MediaAssetRow = {
				...data,
				supersededAt: null,
				createdAt: new Date(),
			};
			assets.push(row);
			return row;
		},
		findById: async (id: string) => assets.find((row) => row.id === id) ?? null,
		findByKey: async (key: string) =>
			assets.find((row) => row.key === key) ?? null,
		deleteById: async (id: string) => {
			const index = assets.findIndex((row) => row.id === id);
			if (index >= 0) assets.splice(index, 1);
		},
		sumActiveSizeByOrg: async () => 0,
		supersedeForUser: async (
			userId: string,
			kind: string,
			exceptId: string,
			now: Date,
		) => {
			for (const row of assets) {
				if (
					row.ownerUserId === userId &&
					row.kind === kind &&
					row.id !== exceptId &&
					row.supersededAt === null
				) {
					row.supersededAt = now;
				}
			}
		},
		supersedeForOrg: async (
			orgId: string,
			kind: string,
			exceptId: string,
			now: Date,
		) => {
			for (const row of assets) {
				if (
					row.orgId === orgId &&
					row.kind === kind &&
					row.id !== exceptId &&
					row.supersededAt === null
				) {
					row.supersededAt = now;
				}
			}
		},
		findSupersededBefore: async () => [],
	} as MediaAssetDao;
	const storage = {
		presignPut:
			presignPut ?? (async (key: string) => `https://storage.example/${key}`),
		presignGet: async (key: string) => `https://storage.example/${key}`,
		stat: async (key: string) => {
			const object = objects.get(key);
			return object
				? { size: object.size, contentType: object.contentType }
				: null;
		},
		get: async (key: string) => {
			const object = objects.get(key);
			return object
				? {
						body: object.body,
						contentType: object.contentType,
						contentLength: object.size,
						etag: '"asset"',
					}
				: null;
		},
		remove: async (key: string) => {
			removed.push(key);
		},
		publicUrl: () => null,
	} satisfies StorageAdapter;
	const service = createMediaService({
		mediaAssetDao,
		pendingUploadDao,
		storage,
		resolvePublicApiUrl: () => "https://api.example.com",
	});
	return { service, pending, assets, objects, removed };
};

const image = {
	filename: "avatar.webp",
	contentType: "image/webp" as const,
	size: 1200,
};

test("avatar presign, register and delete use a stable API url", async () => {
	const { service, pending, assets, objects, removed } = harness();
	const reserved = await service.presignAvatar("user-1", image);
	assert.equal(pending.length, 1);
	assert.equal(pending[0]?.kind, "avatar");
	assert.equal(pending[0]?.orgId, null);
	assert.match(reserved.key, /^users\/user-1\/avatars\//);

	objects.set(reserved.key, {
		size: 800,
		contentType: "image/webp",
		body: new ReadableStream(),
	});
	const registered = await service.registerAvatar(
		"user-1",
		{ key: reserved.key },
		"http://localhost:8787/api/me/avatar",
	);
	assert.equal(pending.length, 0);
	assert.equal(assets[0]?.size, 800);
	assert.equal(
		registered.url,
		`https://api.example.com/api/media/${registered.assetId}`,
	);

	await service.deleteAvatar("user-1", registered.url);
	assert.deepEqual(removed, [reserved.key]);
	assert.equal(assets.length, 0);
});

test("replacing an avatar marks the previous asset superseded", async () => {
	const { service, assets, objects } = harness();
	const first = await service.presignAvatar("user-1", image);
	objects.set(first.key, {
		size: 100,
		contentType: "image/webp",
		body: new ReadableStream(),
	});
	await service.registerAvatar(
		"user-1",
		{ key: first.key },
		"https://api.example.com/api/me/avatar",
	);
	const second = await service.presignAvatar("user-1", image);
	objects.set(second.key, {
		size: 100,
		contentType: "image/webp",
		body: new ReadableStream(),
	});
	await service.registerAvatar(
		"user-1",
		{ key: second.key },
		"https://api.example.com/api/me/avatar",
	);
	assert.equal(assets.length, 2);
	assert.ok(assets[0]?.supersededAt);
	assert.equal(assets[1]?.supersededAt, null);
});

test("avatar register rejects an expired reservation and an oversized object", async () => {
	const { service, pending, objects } = harness();
	await assert.rejects(
		() =>
			service.registerAvatar(
				"user-1",
				{ key: "users/user-1/avatars/missing.webp" },
				"https://api.example.com/api/me/avatar",
			),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.UPLOAD_NOT_PENDING,
	);

	const reserved = await service.presignAvatar("user-1", image);
	const row = pending[0];
	assert.ok(row);
	row.expiresAt = new Date(Date.now() - 1_000);
	await assert.rejects(
		() =>
			service.registerAvatar(
				"user-1",
				{ key: reserved.key },
				"https://api.example.com/api/me/avatar",
			),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.UPLOAD_NOT_PENDING,
	);

	row.expiresAt = new Date(Date.now() + 60_000);
	objects.set(reserved.key, {
		size: MEDIA_MAX_SIZE + 1,
		contentType: "image/webp",
		body: new ReadableStream(),
	});
	await assert.rejects(
		() =>
			service.registerAvatar(
				"user-1",
				{ key: reserved.key },
				"https://api.example.com/api/me/avatar",
			),
		(error: unknown) =>
			error instanceof ApiError && error.code === ApiErrorCode.FILE_TOO_LARGE,
	);
});

test("svg and oversized avatar reservations are rejected", async () => {
	const { service, pending } = harness();
	await assert.rejects(
		() =>
			service.presignAvatar("user-1", {
				filename: "evil.svg",
				contentType: "image/svg+xml" as "image/webp",
				size: 100,
			}),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.UNSUPPORTED_MEDIA_TYPE,
	);
	await assert.rejects(
		() =>
			service.presignAvatar("user-1", {
				...image,
				size: MEDIA_MAX_SIZE + 1,
			}),
		(error: unknown) =>
			error instanceof ApiError && error.code === ApiErrorCode.FILE_TOO_LARGE,
	);
	assert.equal(pending.length, 0);
});

test("organization logo register is scoped to that organization", async () => {
	const { service, assets, objects } = harness();
	const reserved = await service.presignOrgLogo("org-1", "user-1", image);
	assert.match(reserved.key, /^orgs\/org-1\/logo\//);
	objects.set(reserved.key, {
		size: 90,
		contentType: "image/webp",
		body: new ReadableStream(),
	});
	const registered = await service.registerOrgLogo(
		"org-1",
		"user-1",
		{ key: reserved.key },
		"https://api.example.com/api/orgs/org-1/logo",
	);
	assert.equal(assets[0]?.orgId, "org-1");
	await assert.rejects(
		() => service.deleteOrgLogo("org-2", registered.url),
		(error: unknown) =>
			error instanceof ApiError && error.code === ApiErrorCode.ASSET_NOT_FOUND,
	);
	assert.equal(assets.length, 1);
});

test("public media reads the object and drops a missing one", async () => {
	const { service, assets, objects } = harness();
	const reserved = await service.presignAvatar("user-1", image);
	const body = new ReadableStream();
	objects.set(reserved.key, {
		size: 4,
		contentType: "image/webp",
		body,
	});
	const registered = await service.registerAvatar(
		"user-1",
		{ key: reserved.key },
		"https://api.example.com/api/me/avatar",
	);
	const media = await service.getMedia(registered.assetId);
	assert.equal(media.contentType, "image/webp");
	assert.equal(media.contentLength, 4);
	assert.equal(media.body, body);

	objects.delete(reserved.key);
	await assert.rejects(
		() => service.getMedia(registered.assetId),
		(error: unknown) =>
			error instanceof ApiError && error.code === ApiErrorCode.ASSET_NOT_FOUND,
	);
	assert.equal(assets.length, 0);
});
