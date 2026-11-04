import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ApiErrorCode, PLANS } from "@workspace/shared";
import type { AttachmentDao } from "../src/dao/attachment.dao";
import type {
	PendingUploadDao,
	PendingUploadRow,
} from "../src/dao/pending-upload.dao";
import type { AttachmentDto } from "../src/dto/attachment.dto";
import type { StorageAdapter } from "../src/lib/storage/types";
import { createAttachmentService } from "../src/services/attachment.service";
import { createStorageUsageService } from "../src/services/storage-usage.service";

const issue = {
	id: "issue-1",
	projectId: "project",
	number: 4,
};

const quotaKinds = new Set(["issue_attachment", "comment_attachment"]);

const harness = ({
	usageBytes = 0,
	issueCount = 0,
	presignPut,
}: {
	usageBytes?: number;
	issueCount?: number;
	presignPut?: StorageAdapter["presignPut"];
} = {}) => {
	const pending: PendingUploadRow[] = [];
	const attachments: AttachmentDto[] = [];
	const objects = new Map<
		string,
		{ size: number; contentType: string | null }
	>();
	const now = () => new Date();
	const pendingUploadDao = {
		create: async (data: Omit<PendingUploadRow, "createdAt">) => {
			pending.push({ ...data, createdAt: now() });
		},
		findByKey: async (key: string) =>
			pending.find((row) => row.key === key) ?? null,
		deleteByKey: async (key: string) => {
			const index = pending.findIndex((row) => row.key === key);
			if (index >= 0) pending.splice(index, 1);
		},
		deleteByKeyIfExpired: async (key: string, asOf: Date) => {
			const index = pending.findIndex(
				(row) => row.key === key && row.expiresAt.getTime() < asOf.getTime(),
			);
			if (index < 0) return false;
			pending.splice(index, 1);
			return true;
		},
		findExpired: async () => [],
		sumDeclaredSizeByOrg: async (orgId: string, asOf: Date) =>
			pending
				.filter(
					(row) =>
						row.orgId === orgId &&
						row.expiresAt.getTime() > asOf.getTime() &&
						quotaKinds.has(row.kind),
				)
				.reduce((total, row) => total + row.declaredSize, 0),
		countByTarget: async (
			orgId: string,
			kind: string,
			targetId: string,
			asOf: Date,
		) =>
			pending.filter(
				(row) =>
					row.orgId === orgId &&
					row.kind === kind &&
					row.targetId === targetId &&
					row.expiresAt.getTime() > asOf.getTime(),
			).length,
	} as PendingUploadDao;
	const attachmentDao = {
		sumSizeByOrg: async () => usageBytes,
		countByIssue: async () => issueCount,
		countByComment: async () => 0,
		listByIssue: async (orgId: string, issueId: string) =>
			attachments.filter(
				(row) =>
					row.orgId === orgId && row.issueId === issueId && !row.commentId,
			),
		listByComment: async (orgId: string, commentId: string) =>
			attachments.filter(
				(row) => row.orgId === orgId && row.commentId === commentId,
			),
		listByCommentIds: async (orgId: string, commentIds: string[]) =>
			attachments.filter(
				(row) =>
					row.orgId === orgId &&
					row.commentId !== null &&
					commentIds.includes(row.commentId),
			),
		listKeysForCommentThread: async (orgId: string, commentId: string) =>
			attachments
				.filter((row) => row.orgId === orgId && row.commentId === commentId)
				.map((row) => row.key),
		findById: async (orgId: string, id: string) =>
			attachments.find((row) => row.orgId === orgId && row.id === id) ?? null,
		delete: async (_orgId: string, id: string) => {
			const index = attachments.findIndex((row) => row.id === id);
			if (index >= 0) attachments.splice(index, 1);
			return true;
		},
		findByKey: async (key: string) =>
			attachments.find((row) => row.key === key) ?? null,
		create: async (
			data: {
				id: string;
				orgId: string;
				issueId: string;
				commentId?: string | null;
				uploaderId: string | null;
				key: string;
				filename: string;
				contentType: string;
				size: number;
			},
			_activity?: unknown,
			pendingKey?: string,
		) => {
			const row: AttachmentDto = {
				id: data.id,
				orgId: data.orgId,
				issueId: data.issueId,
				commentId: data.commentId ?? null,
				key: data.key,
				filename: data.filename,
				contentType: data.contentType,
				size: data.size,
				uploader: null,
				createdAt: now().toISOString(),
			};
			attachments.push(row);
			if (pendingKey) {
				const index = pending.findIndex((item) => item.key === pendingKey);
				if (index >= 0) pending.splice(index, 1);
			}
			return row;
		},
	} as unknown as AttachmentDao;
	const storage = {
		presignPut:
			presignPut ?? (async (key: string) => `https://storage.example/${key}`),
		presignGet: async (key: string) => `https://storage.example/${key}`,
		stat: async (key: string) => objects.get(key) ?? null,
		get: async () => null,
		remove: async () => {},
		publicUrl: () => null,
	} satisfies StorageAdapter;
	const storageUsage = createStorageUsageService({
		attachmentDao,
		pendingUploadDao,
		mediaAssetDao: { sumActiveSizeByOrg: async () => 0 },
		plans: { getLimitsForOrg: async () => PLANS.free },
	});
	const service = createAttachmentService({
		attachmentDao,
		issueDao: {
			findByProjectAndNumber: async () => issue,
		} as never,
		projectDao: {
			findById: async () => ({ archived: false }),
		} as never,
		pendingUploadDao,
		commentDao: {
			findById: async (_orgId: string, id: string) =>
				id === "comment-1"
					? {
							id: "comment-1",
							orgId: "org",
							issueId: issue.id,
							body: "Looks good",
							author: {
								id: "user-1",
								name: "User",
								email: "user@example.com",
								image: null,
							},
							createdAt: now().toISOString(),
							updatedAt: now().toISOString(),
							attachments: [],
						}
					: null,
		} as never,
		storage,
		plans: { getLimitsForOrg: async () => PLANS.free },
		storageUsage,
	});
	return { service, pending, attachments, objects };
};

const presignInput = {
	filename: "note.png",
	contentType: "image/png",
	size: 128,
};

test("presign reserves a pending upload for the signed-in user", async () => {
	let signedSize: number | undefined;
	const { service, pending } = harness({
		presignPut: async (_key, _contentType, _expiresIn, size) => {
			signedSize = size;
			return "https://storage.example/signed";
		},
	});
	const result = await service.presignUpload(
		"org",
		"project",
		4,
		"user-1",
		presignInput,
	);
	assert.equal(pending.length, 1);
	assert.equal(pending[0]?.key, result.key);
	assert.equal(pending[0]?.userId, "user-1");
	assert.equal(pending[0]?.kind, "issue_attachment");
	assert.equal(pending[0]?.targetId, issue.id);
	assert.equal(pending[0]?.declaredSize, 128);
	assert.equal(signedSize, 128);
	assert.match(result.uploadUrl, /^https:\/\/storage\.example\//);
});

test("presign rejects when org bytes or the per-issue count would exceed the free plan", async () => {
	const full = harness({ usageBytes: PLANS.free.storageBytes });
	await assert.rejects(
		() =>
			full.service.presignUpload("org", "project", 4, "user-1", presignInput),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.STORAGE_QUOTA_EXCEEDED,
	);
	assert.equal(full.pending.length, 0);

	const crowded = harness({
		issueCount: PLANS.free.attachmentsPerIssue,
	});
	await assert.rejects(
		() =>
			crowded.service.presignUpload(
				"org",
				"project",
				4,
				"user-1",
				presignInput,
			),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.STORAGE_QUOTA_EXCEEDED,
	);
	assert.equal(crowded.pending.length, 0);
});

test("a failed presign drops the pending reservation", async () => {
	const { service, pending } = harness({
		presignPut: async () => {
			throw new Error("sign failed");
		},
	});
	await assert.rejects(() =>
		service.presignUpload("org", "project", 4, "user-1", presignInput),
	);
	assert.equal(pending.length, 0);
});

test("register requires a live reservation and stores the HEAD size", async () => {
	const { service, pending, attachments, objects } = harness();
	await assert.rejects(
		() =>
			service.register("org", "project", 4, "user-1", {
				key: `orgs/org/issues/${issue.id}/missing.bin`,
				filename: "note.png",
				contentType: "image/png",
				size: 128,
			}),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.UPLOAD_NOT_PENDING,
	);

	const reserved = await service.presignUpload(
		"org",
		"project",
		4,
		"user-1",
		presignInput,
	);
	objects.set(reserved.key, { size: 64, contentType: "image/png" });
	const created = await service.register("org", "project", 4, "user-1", {
		key: reserved.key,
		filename: "note.png",
		contentType: "image/png",
		size: 128,
	});
	assert.equal(created.size, 64);
	assert.equal(pending.length, 0);
	assert.equal(attachments.length, 1);
});

test("comment uploads reserve against the comment and keep the file off the issue list", async () => {
	const { service, pending, attachments, objects } = harness();
	const reserved = await service.presignCommentUpload(
		"org",
		"project",
		4,
		"comment-1",
		"user-1",
		presignInput,
	);
	assert.equal(pending[0]?.kind, "comment_attachment");
	assert.equal(pending[0]?.targetId, "comment-1");
	assert.match(reserved.key, /\/comments\/comment-1\//);
	objects.set(reserved.key, { size: 64, contentType: "image/png" });
	const created = await service.registerComment(
		"org",
		"project",
		4,
		"comment-1",
		"user-1",
		{
			key: reserved.key,
			filename: "note.png",
			contentType: "image/png",
			size: 128,
		},
	);
	assert.equal(created.commentId, "comment-1");
	assert.equal(created.size, 64);
	assert.equal(pending.length, 0);
	const grouped = await service.forComments("org", ["comment-1"]);
	assert.equal(grouped.get("comment-1")?.length, 1);
	assert.equal((await service.list("org", "project", 4)).length, 0);
	await service.removeComment("org", "project", 4, "comment-1", created.id, {
		userId: "user-1",
		role: "member",
	});
	assert.equal(attachments.length, 0);
});

test("comment presign rejects a missing comment before reserving quota", async () => {
	const { service, pending } = harness();
	await assert.rejects(
		() =>
			service.presignCommentUpload(
				"org",
				"project",
				4,
				"missing",
				"user-1",
				presignInput,
			),
		(error: unknown) =>
			error instanceof ApiError &&
			error.code === ApiErrorCode.COMMENT_NOT_FOUND,
	);
	assert.equal(pending.length, 0);
});

test("only the comment author can reserve or register comment attachments", async () => {
	const { service, pending } = harness();
	await assert.rejects(
		() =>
			service.presignCommentUpload(
				"org",
				"project",
				4,
				"comment-1",
				"user-2",
				presignInput,
			),
		(error: unknown) =>
			error instanceof ApiError && error.code === ApiErrorCode.FORBIDDEN,
	);
	assert.equal(pending.length, 0);

	const reserved = await service.presignCommentUpload(
		"org",
		"project",
		4,
		"comment-1",
		"user-1",
		presignInput,
	);
	await assert.rejects(
		() =>
			service.registerComment("org", "project", 4, "comment-1", "user-2", {
				key: reserved.key,
				filename: "note.png",
				contentType: "image/png",
				size: 128,
			}),
		(error: unknown) =>
			error instanceof ApiError && error.code === ApiErrorCode.FORBIDDEN,
	);
});

test("comment register rejects an empty object", async () => {
	const { service, objects } = harness();
	const reserved = await service.presignCommentUpload(
		"org",
		"project",
		4,
		"comment-1",
		"user-1",
		presignInput,
	);
	objects.set(reserved.key, { size: 0, contentType: "image/png" });
	await assert.rejects(
		() =>
			service.registerComment("org", "project", 4, "comment-1", "user-1", {
				key: reserved.key,
				filename: "note.png",
				contentType: "image/png",
				size: 128,
			}),
		(error: unknown) =>
			error instanceof ApiError && error.code === ApiErrorCode.FILE_TOO_LARGE,
	);
});
