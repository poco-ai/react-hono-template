import {
	ApiError,
	ApiErrorCode,
	ATTACHMENT_CONTENT_TYPES,
	type AttachmentPresignInput,
	PLANS,
	type RegisterAttachmentInput,
} from "@workspace/shared";
import type { ActivityInsert } from "../dao/activity.dao";
import type { AttachmentDao } from "../dao/attachment.dao";
import type { IssueDao } from "../dao/issue.dao";
import type { ProjectDao } from "../dao/project.dao";
import type {
	AttachmentWithUrlDto,
	PresignAttachmentResponseDto,
} from "../dto/attachment.dto";
import type { IssueDto } from "../dto/issue.dto";
import type { BackgroundFn } from "../lib/background";
import type { PlanService } from "../lib/plan";
import type { StorageAdapter } from "../lib/storage/types";
import type { WebhookDispatcher } from "./webhook.service";

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
	storage,
	webhooks,
	plans,
}: {
	attachmentDao: AttachmentDao;
	issueDao: IssueDao;
	projectDao: ProjectDao;
	storage: StorageAdapter | null;
	webhooks?: WebhookDispatcher;
	plans: PlanService;
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
	): ActivityInsert => ({
		id: crypto.randomUUID(),
		orgId,
		projectId,
		issueId,
		actorId,
		action,
		field: null,
		oldValue: null,
		newValue,
	});

	return {
		presignUpload: async (
			orgId: string,
			projectId: string,
			number: number,
			input: AttachmentPresignInput,
		): Promise<PresignAttachmentResponseDto> => {
			const s3 = requireStorage(storage);
			const issue = await requireWritableIssue(orgId, projectId, number);
			assertContentTypeAllowed(input.contentType);
			if (input.size !== undefined) {
				assertSizeAllowed(
					input.size,
					PLANS[await plans.getPlanForOrg(orgId)].attachmentMaxSize,
				);
			}
			const key = `orgs/${orgId}/issues/${issue.id}/${crypto.randomUUID()}.${extensionOf(input.filename)}`;
			const uploadUrl = await s3.presignPut(
				key,
				input.contentType,
				ATTACHMENT_UPLOAD_URL_EXPIRES_IN,
			);
			return {
				key,
				uploadUrl,
				expiresIn: ATTACHMENT_UPLOAD_URL_EXPIRES_IN,
			};
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
			const maxSize = PLANS[await plans.getPlanForOrg(orgId)].attachmentMaxSize;
			assertSizeAllowed(input.size, maxSize);
			const s3 = requireStorage(storage);
			const stat = await s3.stat(input.key);
			if (!stat) {
				throw new ApiError(
					400,
					ApiErrorCode.KEY_MISMATCH,
					"No uploaded object found for this key — upload the file before registering",
				);
			}
			if (stat.size > maxSize) {
				throw new ApiError(
					413,
					ApiErrorCode.FILE_TOO_LARGE,
					`Uploaded object is ${stat.size} bytes, exceeding the ${maxSize} byte plan limit`,
				);
			}
			if (stat.contentType && !stat.contentType.startsWith(input.contentType)) {
				throw new ApiError(
					400,
					ApiErrorCode.VALIDATION,
					"Uploaded object content type does not match the registered content type",
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
					contentType: input.contentType,
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
			if (!attachment || attachment.issueId !== issue.id) {
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
	};
};

export type AttachmentService = ReturnType<typeof createAttachmentService>;
