import {
	ApiError,
	ApiErrorCode,
	ATTACHMENT_CONTENT_TYPES,
	type AttachmentPresignInput,
	type RegisterAttachmentInput,
} from "@workspace/shared";
import type { ActivityInsert } from "../dao/activity.dao";
import type { AttachmentDao } from "../dao/attachment.dao";
import type { CommentDao } from "../dao/comment.dao";
import type { IssueDao } from "../dao/issue.dao";
import type { PendingUploadDao } from "../dao/pending-upload.dao";
import type { ProjectDao } from "../dao/project.dao";
import type {
	AttachmentDto,
	AttachmentWithUrlDto,
	PresignAttachmentResponseDto,
} from "../dto/attachment.dto";
import type { IssueDto } from "../dto/issue.dto";
import type { BackgroundFn } from "../lib/background";
import type { StorageAdapter } from "../lib/storage/types";
import { PENDING_UPLOAD_TTL_MS } from "../lib/storage/uploads";
import type { PlanService } from "./plan.service";
import type { StorageUsageService } from "./storage-usage.service";
import type { WebhookDispatcher } from "./webhook-delivery.service";

export const ATTACHMENT_UPLOAD_URL_EXPIRES_IN = 600;
export const ATTACHMENT_DOWNLOAD_URL_EXPIRES_IN = 300;

const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/;

const extensionOf = (filename: string) => {
	const ext = (filename.split(".").pop() ?? "").toLowerCase();
	return EXTENSION_PATTERN.test(ext) ? ext : "bin";
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

const assertContentTypeAllowed = (contentType: string) => {
	if (!(ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(contentType)) {
		throw new ApiError(
			415,
			ApiErrorCode.FILE_TYPE_NOT_ALLOWED,
			`Content type "${contentType}" is not allowed for attachments`,
		);
	}
};

export const createAttachmentService = ({
	attachmentDao,
	issueDao,
	projectDao,
	commentDao,
	pendingUploadDao,
	storage,
	webhooks,
	plans,
	storageUsage,
}: {
	attachmentDao: AttachmentDao;
	issueDao: IssueDao;
	projectDao: ProjectDao;
	commentDao: CommentDao;
	pendingUploadDao: PendingUploadDao;
	storage: StorageAdapter | null;
	webhooks?: WebhookDispatcher;
	plans: Pick<PlanService, "getLimitsForOrg">;
	storageUsage: StorageUsageService;
}) => {
	const assertSizeAllowed = (size: number, maxSize: number) => {
		if (!Number.isSafeInteger(size) || size < 1 || size > maxSize) {
			throw new ApiError(
				413,
				ApiErrorCode.FILE_TOO_LARGE,
				`Attachment size must be between 1 byte and ${maxSize} bytes (plan limit)`,
			);
		}
	};

	const requireIssue = async (
		orgId: string,
		projectId: string,
		number: number,
	): Promise<IssueDto> => {
		const issue = await issueDao.findByProjectAndNumber(
			orgId,
			projectId,
			number,
		);
		if (!issue) {
			throw new ApiError(
				404,
				ApiErrorCode.ISSUE_NOT_FOUND,
				`Issue #${number} not found`,
			);
		}
		return issue;
	};

	const requireWritableIssue = async (
		orgId: string,
		projectId: string,
		number: number,
	): Promise<IssueDto> => {
		const issue = await requireIssue(orgId, projectId, number);
		const project = await projectDao.findById(orgId, issue.projectId);
		if (project?.archived) {
			throw new ApiError(
				409,
				ApiErrorCode.PROJECT_ARCHIVED,
				"Project is archived and read-only",
			);
		}
		return issue;
	};

	const recordActivity = (
		orgId: string,
		projectId: string,
		issueId: string,
		actorId: string,
		action: string,
		newValue: string,
		field: string | null = null,
	): ActivityInsert => ({
		id: crypto.randomUUID(),
		orgId,
		projectId,
		issueId,
		actorId,
		action,
		field,
		oldValue: null,
		newValue,
	});

	const withUrls = async (
		rows: AttachmentDto[],
	): Promise<AttachmentWithUrlDto[]> => {
		if (!storage) {
			return rows.map((row) => ({ ...row, url: null }));
		}
		return Promise.all(
			rows.map(async (row) => ({
				...row,
				url: await storage.presignGet(
					row.key,
					ATTACHMENT_DOWNLOAD_URL_EXPIRES_IN,
				),
			})),
		);
	};

	const requireCommentOnIssue = async (
		orgId: string,
		issueId: string,
		commentId: string,
	) => {
		const comment = await commentDao.findById(orgId, commentId);
		if (!comment || comment.issueId !== issueId) {
			throw new ApiError(
				404,
				ApiErrorCode.COMMENT_NOT_FOUND,
				`Comment ${commentId} not found`,
			);
		}
		return comment;
	};

	const assertCommentAuthor = (
		comment: { author: { id: string } },
		userId: string,
	) => {
		if (comment.author.id !== userId) {
			throw new ApiError(
				403,
				ApiErrorCode.FORBIDDEN,
				"Only the comment author can attach files to this comment",
			);
		}
	};

	return {
		presignUpload: async (
			orgId: string,
			projectId: string,
			number: number,
			userId: string,
			input: AttachmentPresignInput,
		): Promise<PresignAttachmentResponseDto> => {
			const s3 = requireStorage(storage);
			const issue = await requireWritableIssue(orgId, projectId, number);
			assertContentTypeAllowed(input.contentType);
			await storageUsage.assertCanUpload(orgId, input.size, {
				kind: "issue_attachment",
				issueId: issue.id,
			});
			const key = `orgs/${orgId}/issues/${issue.id}/${crypto.randomUUID()}.${extensionOf(input.filename)}`;
			const pendingId = crypto.randomUUID();
			await pendingUploadDao.create({
				id: pendingId,
				key,
				kind: "issue_attachment",
				orgId,
				userId,
				targetId: issue.id,
				declaredSize: input.size,
				contentType: input.contentType,
				expiresAt: new Date(Date.now() + PENDING_UPLOAD_TTL_MS),
			});
			try {
				const uploadUrl = await s3.presignPut(
					key,
					input.contentType,
					ATTACHMENT_UPLOAD_URL_EXPIRES_IN,
					input.size,
				);
				return {
					key,
					uploadUrl,
					expiresIn: ATTACHMENT_UPLOAD_URL_EXPIRES_IN,
				};
			} catch (error) {
				await pendingUploadDao.deleteByKey(key).catch((deleteError) => {
					console.error(
						"[attachment] failed to drop pending upload after presign error:",
						deleteError,
					);
				});
				throw error;
			}
		},

		register: async (
			orgId: string,
			projectId: string,
			number: number,
			userId: string,
			input: RegisterAttachmentInput,
			background?: BackgroundFn,
		): Promise<AttachmentWithUrlDto> => {
			const issue = await requireWritableIssue(orgId, projectId, number);
			const expectedPrefix = `orgs/${orgId}/issues/${issue.id}/`;
			if (!input.key.startsWith(expectedPrefix)) {
				throw new ApiError(
					400,
					ApiErrorCode.KEY_MISMATCH,
					"Storage key does not belong to this issue",
				);
			}
			assertContentTypeAllowed(input.contentType);
			const pending = await pendingUploadDao.findByKey(input.key);
			if (
				!pending ||
				pending.expiresAt.getTime() <= Date.now() ||
				pending.orgId !== orgId ||
				pending.userId !== userId ||
				pending.kind !== "issue_attachment" ||
				pending.targetId !== issue.id
			) {
				throw new ApiError(
					400,
					ApiErrorCode.UPLOAD_NOT_PENDING,
					"Upload was not reserved or has expired",
				);
			}
			if (input.contentType !== pending.contentType) {
				throw new ApiError(
					400,
					ApiErrorCode.VALIDATION,
					"Registered content type does not match the reserved upload",
				);
			}
			const maxSize = (await plans.getLimitsForOrg(orgId)).attachmentMaxSize;
			const s3 = requireStorage(storage);
			const stat = await s3.stat(input.key);
			if (!stat) {
				throw new ApiError(
					400,
					ApiErrorCode.KEY_MISMATCH,
					"No uploaded object found for this key — upload the file before registering",
				);
			}
			if (stat.size > maxSize || stat.size > pending.declaredSize) {
				throw new ApiError(
					413,
					ApiErrorCode.FILE_TOO_LARGE,
					`Uploaded object is ${stat.size} bytes, exceeding the reserved ${Math.min(maxSize, pending.declaredSize)} byte limit`,
				);
			}
			assertSizeAllowed(stat.size, maxSize);
			if (
				stat.contentType &&
				!stat.contentType.startsWith(pending.contentType)
			) {
				throw new ApiError(
					400,
					ApiErrorCode.VALIDATION,
					"Uploaded object content type does not match the registered content type",
				);
			}
			const existing = await attachmentDao.findByKey(input.key);
			if (existing) {
				throw new ApiError(
					409,
					ApiErrorCode.CONFLICT,
					"This object has already been registered",
				);
			}
			const attachment = await attachmentDao.create(
				{
					id: crypto.randomUUID(),
					orgId,
					issueId: issue.id,
					uploaderId: userId,
					key: input.key,
					filename: input.filename,
					contentType: pending.contentType,
					size: stat.size,
				},
				recordActivity(
					orgId,
					issue.projectId,
					issue.id,
					userId,
					"attachment.added",
					input.filename,
				),
				input.key,
			);
			const url = storage
				? await storage.presignGet(
						attachment.key,
						ATTACHMENT_DOWNLOAD_URL_EXPIRES_IN,
					)
				: null;
			const result = { ...attachment, url };
			await webhooks?.dispatch(
				orgId,
				"attachment.added",
				{ attachment, issueId: issue.id, issueNumber: issue.number },
				background,
			);
			return result;
		},

		list: async (
			orgId: string,
			projectId: string,
			number: number,
		): Promise<AttachmentWithUrlDto[]> => {
			const issue = await requireIssue(orgId, projectId, number);
			const rows = await attachmentDao.listByIssue(orgId, issue.id);
			if (!storage) {
				return rows.map((row) => ({ ...row, url: null }));
			}
			return Promise.all(
				rows.map(async (row) => ({
					...row,
					url: await storage.presignGet(
						row.key,
						ATTACHMENT_DOWNLOAD_URL_EXPIRES_IN,
					),
				})),
			);
		},

		remove: async (
			orgId: string,
			projectId: string,
			number: number,
			attachmentId: string,
			actor: { userId: string; role: string },
		) => {
			const issue = await requireIssue(orgId, projectId, number);
			const attachment = await attachmentDao.findById(orgId, attachmentId);
			if (
				!attachment ||
				attachment.issueId !== issue.id ||
				attachment.commentId
			) {
				throw new ApiError(
					404,
					ApiErrorCode.ATTACHMENT_NOT_FOUND,
					`Attachment ${attachmentId} not found`,
				);
			}
			const isPrivileged = actor.role === "owner" || actor.role === "admin";
			if (attachment.uploader?.id !== actor.userId && !isPrivileged) {
				throw new ApiError(
					403,
					ApiErrorCode.FORBIDDEN,
					"Only the uploader or an organization admin can remove this attachment",
				);
			}
			if (storage) {
				try {
					await storage.remove(attachment.key);
				} catch (e) {
					console.error("[attachment] storage delete failed:", e);
				}
			}
			await attachmentDao.delete(
				orgId,
				attachmentId,
				recordActivity(
					orgId,
					issue.projectId,
					issue.id,
					actor.userId,
					"attachment.removed",
					attachment.filename,
				),
			);
			return { deleted: true };
		},

		presignCommentUpload: async (
			orgId: string,
			projectId: string,
			number: number,
			commentId: string,
			userId: string,
			input: AttachmentPresignInput,
		): Promise<PresignAttachmentResponseDto> => {
			const s3 = requireStorage(storage);
			const issue = await requireWritableIssue(orgId, projectId, number);
			const comment = await requireCommentOnIssue(orgId, issue.id, commentId);
			assertCommentAuthor(comment, userId);
			assertContentTypeAllowed(input.contentType);
			await storageUsage.assertCanUpload(orgId, input.size, {
				kind: "comment_attachment",
				commentId: comment.id,
			});
			const key = `orgs/${orgId}/issues/${issue.id}/comments/${comment.id}/${crypto.randomUUID()}.${extensionOf(input.filename)}`;
			await pendingUploadDao.create({
				id: crypto.randomUUID(),
				key,
				kind: "comment_attachment",
				orgId,
				userId,
				targetId: comment.id,
				declaredSize: input.size,
				contentType: input.contentType,
				expiresAt: new Date(Date.now() + PENDING_UPLOAD_TTL_MS),
			});
			try {
				const uploadUrl = await s3.presignPut(
					key,
					input.contentType,
					ATTACHMENT_UPLOAD_URL_EXPIRES_IN,
					input.size,
				);
				return {
					key,
					uploadUrl,
					expiresIn: ATTACHMENT_UPLOAD_URL_EXPIRES_IN,
				};
			} catch (error) {
				await pendingUploadDao.deleteByKey(key).catch((deleteError) => {
					console.error(
						"[attachment] failed to drop pending upload after presign error:",
						deleteError,
					);
				});
				throw error;
			}
		},

		registerComment: async (
			orgId: string,
			projectId: string,
			number: number,
			commentId: string,
			userId: string,
			input: RegisterAttachmentInput,
			background?: BackgroundFn,
		): Promise<AttachmentWithUrlDto> => {
			const issue = await requireWritableIssue(orgId, projectId, number);
			const comment = await requireCommentOnIssue(orgId, issue.id, commentId);
			assertCommentAuthor(comment, userId);
			const expectedPrefix = `orgs/${orgId}/issues/${issue.id}/comments/${comment.id}/`;
			if (!input.key.startsWith(expectedPrefix)) {
				throw new ApiError(
					400,
					ApiErrorCode.KEY_MISMATCH,
					"Storage key does not belong to this comment",
				);
			}
			assertContentTypeAllowed(input.contentType);
			const pending = await pendingUploadDao.findByKey(input.key);
			if (
				!pending ||
				pending.expiresAt.getTime() <= Date.now() ||
				pending.orgId !== orgId ||
				pending.userId !== userId ||
				pending.kind !== "comment_attachment" ||
				pending.targetId !== comment.id
			) {
				throw new ApiError(
					400,
					ApiErrorCode.UPLOAD_NOT_PENDING,
					"Upload was not reserved or has expired",
				);
			}
			if (input.contentType !== pending.contentType) {
				throw new ApiError(
					400,
					ApiErrorCode.VALIDATION,
					"Registered content type does not match the reserved upload",
				);
			}
			const maxSize = (await plans.getLimitsForOrg(orgId)).attachmentMaxSize;
			const s3 = requireStorage(storage);
			const stat = await s3.stat(input.key);
			if (!stat) {
				throw new ApiError(
					400,
					ApiErrorCode.KEY_MISMATCH,
					"No uploaded object found for this key — upload the file before registering",
				);
			}
			if (stat.size > maxSize || stat.size > pending.declaredSize) {
				throw new ApiError(
					413,
					ApiErrorCode.FILE_TOO_LARGE,
					"Uploaded object is larger than the reserved size",
				);
			}
			assertSizeAllowed(stat.size, maxSize);
			if (
				stat.contentType &&
				!stat.contentType.startsWith(pending.contentType)
			) {
				throw new ApiError(
					400,
					ApiErrorCode.VALIDATION,
					"Uploaded object content type does not match the registered content type",
				);
			}
			const existing = await attachmentDao.findByKey(input.key);
			if (existing) {
				throw new ApiError(
					409,
					ApiErrorCode.CONFLICT,
					"This object has already been registered",
				);
			}
			const attachment = await attachmentDao.create(
				{
					id: crypto.randomUUID(),
					orgId,
					issueId: issue.id,
					commentId: comment.id,
					uploaderId: userId,
					key: input.key,
					filename: input.filename,
					contentType: pending.contentType,
					size: stat.size,
				},
				recordActivity(
					orgId,
					issue.projectId,
					issue.id,
					userId,
					"attachment.added",
					input.filename,
					comment.id,
				),
				input.key,
			);
			const [result] = await withUrls([attachment]);
			await webhooks?.dispatch(
				orgId,
				"attachment.added",
				{
					attachment,
					issueId: issue.id,
					issueNumber: issue.number,
					commentId: comment.id,
				},
				background,
			);
			return result ?? { ...attachment, url: null };
		},

		listComment: async (
			orgId: string,
			projectId: string,
			number: number,
			commentId: string,
		): Promise<AttachmentWithUrlDto[]> => {
			const issue = await requireIssue(orgId, projectId, number);
			await requireCommentOnIssue(orgId, issue.id, commentId);
			return withUrls(await attachmentDao.listByComment(orgId, commentId));
		},

		removeComment: async (
			orgId: string,
			projectId: string,
			number: number,
			commentId: string,
			attachmentId: string,
			actor: { userId: string; role: string },
		) => {
			const issue = await requireWritableIssue(orgId, projectId, number);
			const comment = await requireCommentOnIssue(orgId, issue.id, commentId);
			const attachment = await attachmentDao.findById(orgId, attachmentId);
			if (
				!attachment ||
				attachment.issueId !== issue.id ||
				attachment.commentId !== comment.id
			) {
				throw new ApiError(
					404,
					ApiErrorCode.ATTACHMENT_NOT_FOUND,
					`Attachment ${attachmentId} not found`,
				);
			}
			const isPrivileged = actor.role === "owner" || actor.role === "admin";
			const isUploader = attachment.uploader?.id === actor.userId;
			const isAuthor = comment.author.id === actor.userId;
			if (!isUploader && !isAuthor && !isPrivileged) {
				throw new ApiError(
					403,
					ApiErrorCode.FORBIDDEN,
					"Only the uploader, comment author, or an organization admin can remove this attachment",
				);
			}
			if (storage) {
				try {
					await storage.remove(attachment.key);
				} catch (error) {
					console.error("[attachment] storage delete failed:", error);
				}
			}
			await attachmentDao.delete(
				orgId,
				attachmentId,
				recordActivity(
					orgId,
					issue.projectId,
					issue.id,
					actor.userId,
					"attachment.removed",
					attachment.filename,
					comment.id,
				),
			);
			return { deleted: true };
		},

		forComments: async (orgId: string, commentIds: string[]) => {
			const rows = await withUrls(
				await attachmentDao.listByCommentIds(orgId, commentIds),
			);
			const grouped = new Map<string, AttachmentWithUrlDto[]>();
			for (const row of rows) {
				if (!row.commentId) continue;
				const list = grouped.get(row.commentId) ?? [];
				list.push(row);
				grouped.set(row.commentId, list);
			}
			return grouped;
		},

		purgeForComment: async (orgId: string, commentId: string) => {
			const keys = await attachmentDao.listKeysByComment(orgId, commentId);
			if (!storage) return;
			for (const key of keys) {
				try {
					await storage.remove(key);
				} catch (error) {
					console.error(
						"[attachment] comment attachment delete failed:",
						key,
						error,
					);
				}
			}
		},
	};
};

export type AttachmentService = ReturnType<typeof createAttachmentService>;
