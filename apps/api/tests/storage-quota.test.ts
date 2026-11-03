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
		findByKey: async (key: string) =>
			attachments.find((row) => row.key === key) ?? null,
		create: async (data: {
			id: string;
			orgId: string;
			issueId: string;
			commentId?: string | null;
			uploaderId: string | null;
			key: string;
			filename: string;
			contentType: string;
			size: number;
		}) => {
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
	const { service, pending } = harness();
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
