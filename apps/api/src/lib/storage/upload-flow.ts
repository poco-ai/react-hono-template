import { ApiError, ApiErrorCode } from "@workspace/shared";
import type {
	PendingUploadDao,
	PendingUploadRow,
} from "../../dao/pending-upload.dao";
import type { StorageAdapter } from "./types";
import { PENDING_UPLOAD_TTL_MS, type UploadKind } from "./uploads";

type UploadedObjectStat = { size: number; contentType: string | null };

export const uploadNotPendingError = () =>
	new ApiError(
		ApiErrorCode.UPLOAD_NOT_PENDING,
		"Upload was not reserved or has expired",
	);

/**
 * Creates the pending-upload row and issues the presigned PUT URL. If presign
 * fails the reserved row is dropped again so the quota is not held by an
 * upload that can never complete.
 */
export const reserveUpload = async ({
	pendingUploadDao,
	storage,
	logLabel,
	kind,
	orgId,
	userId,
	key,
	targetId,
	declaredSize,
	contentType,
	expiresIn,
}: {
	pendingUploadDao: Pick<PendingUploadDao, "create" | "deleteByKey">;
	storage: StorageAdapter;
	logLabel: string;
	kind: UploadKind;
	orgId: string | null;
	userId: string;
	key: string;
	targetId: string | null;
	declaredSize: number;
	contentType: string;
	expiresIn: number;
}): Promise<{ key: string; uploadUrl: string; expiresIn: number }> => {
	await pendingUploadDao.create({
		id: crypto.randomUUID(),
		key,
		kind,
		orgId,
		userId,
		targetId,
		declaredSize,
		contentType,
		expiresAt: new Date(Date.now() + PENDING_UPLOAD_TTL_MS),
	});
	try {
		const uploadUrl = await storage.presignPut(
			key,
			contentType,
			expiresIn,
			declaredSize,
		);
		return { key, uploadUrl, expiresIn };
	} catch (error) {
		await pendingUploadDao.deleteByKey(key).catch((deleteError) => {
			console.error(
				`[${logLabel}] failed to drop pending upload after presign error:`,
				deleteError,
			);
		});
		throw error;
	}
};

/** Loads the reservation made by `reserveUpload`, rejecting stale/foreign rows. */
export const loadPendingUpload = async ({
	pendingUploadDao,
	key,
	orgId,
	userId,
	kind,
	targetId,
}: {
	pendingUploadDao: Pick<PendingUploadDao, "findByKey">;
	key: string;
	orgId: string | null;
	userId: string;
	kind: UploadKind;
	targetId?: string;
}): Promise<PendingUploadRow> => {
	const pending = await pendingUploadDao.findByKey(key);
	if (
		!pending ||
		pending.expiresAt.getTime() <= Date.now() ||
		pending.orgId !== orgId ||
		pending.userId !== userId ||
		pending.kind !== kind ||
		(targetId !== undefined && pending.targetId !== targetId)
	) {
		throw uploadNotPendingError();
	}
	return pending;
};

/**
 * Confirms the object reached storage and that its size stays within both the
 * plan limit and the size declared at reservation time.
 */
export const assertUploadedObject = async ({
	storage,
	key,
	declaredSize,
	maxSize,
	missingCode,
	missingMessage,
	tooLargeMessage,
}: {
	storage: StorageAdapter;
	key: string;
	declaredSize: number;
	maxSize: number;
	missingCode: ApiErrorCode;
	missingMessage: string;
	tooLargeMessage: (size: number) => string;
}): Promise<UploadedObjectStat> => {
	const stat = await storage.stat(key);
	if (!stat) {
		throw new ApiError(missingCode, missingMessage);
	}
	if (stat.size > maxSize || stat.size > declaredSize) {
		throw new ApiError(ApiErrorCode.FILE_TOO_LARGE, tooLargeMessage(stat.size));
	}
	return stat;
};

export const assertStoredContentType = ({
	stat,
	declaredContentType,
	code,
	message,
}: {
	stat: UploadedObjectStat;
	declaredContentType: string;
	code: ApiErrorCode;
	message: string;
}) => {
	if (stat.contentType && !stat.contentType.startsWith(declaredContentType)) {
		throw new ApiError(code, message);
	}
};
