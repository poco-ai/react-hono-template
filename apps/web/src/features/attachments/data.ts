import type { AttachmentWithUrlDto } from "@api/dto/attachment.dto";
import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import {
	issueActivitiesKey,
	orgActivitiesRootKey,
} from "@/features/activities/data";
import { billingRootKey } from "@/features/billing/data";
import { client, unwrap } from "@/lib/api";
import { errorCode } from "@/lib/errors";

import type { MutationCallbacks } from "@/lib/mutation-callbacks";
import {
	isAbortError,
	isStorageUnavailableError,
	uploadViaPresign,
} from "@/lib/upload";

export const attachmentUploadErrorKey = (
	error: unknown,
):
	| "attachments.cancelled"
	| "attachments.storageUnavailable"
	| "attachments.quotaExceeded"
	| "attachments.tooLarge"
	| "attachments.typeNotAllowed"
	| "attachments.uploadFailed" => {
	if (isAbortError(error)) return "attachments.cancelled";
	if (isStorageUnavailableError(error)) return "attachments.storageUnavailable";
	switch (errorCode(error)) {
		case "STORAGE_QUOTA_EXCEEDED":
			return "attachments.quotaExceeded";
		case "FILE_TOO_LARGE":
			return "attachments.tooLarge";
		case "FILE_TYPE_NOT_ALLOWED":
			return "attachments.typeNotAllowed";
		default:
			return "attachments.uploadFailed";
	}
};

export function attachmentsQueryKey(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	return [
		"orgs",
		orgId,
		"projects",
		projectId,
		"issues",
		"detail",
		issueNumber,
		"attachments",
	] as const;
}

export function attachmentsQuery(
	orgId: string,
	projectId: string,
	issueNumber: number,
) {
	return queryOptions({
		queryKey: attachmentsQueryKey(orgId, projectId, issueNumber),
		queryFn: (): Promise<AttachmentWithUrlDto[]> =>
			unwrap(
				client.api.orgs[":orgId"].projects[":projectId"].issues[
					":number"
				].attachments.$get({
					param: { orgId, projectId, number: String(issueNumber) },
				}),
			),
	});
}

export const uploadAttachment = async (
	orgId: string,
	projectId: string,
	issueNumber: number,
	{
		file,
		signal,
	}: {
		file: File;
		signal: AbortSignal;
	},
) => {
	const contentType = resolveContentType(file);
	await uploadViaPresign<AttachmentWithUrlDto>({
		file,
		contentType,
		signal,
		presign: () =>
			client.api.orgs[":orgId"].projects[":projectId"].issues[
				":number"
			].attachments.presign.$post({
				param: { orgId, projectId, number: String(issueNumber) },
				json: { filename: file.name, contentType, size: file.size },
			}),
		register: (key) =>
			client.api.orgs[":orgId"].projects[":projectId"].issues[
				":number"
			].attachments.$post({
				param: { orgId, projectId, number: String(issueNumber) },
				json: { key, filename: file.name, contentType, size: file.size },
			}),
	});
};

export function useUploadAttachment(
	orgId: string,
	projectId: string,
	issueNumber: number,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof uploadAttachment>>,
		{
			file: File;
			signal: AbortSignal;
		}
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: { file: File; signal: AbortSignal }) =>
			uploadAttachment(orgId, projectId, issueNumber, input),
		onSuccess: (...args) => {
			void invalidateAttachmentQueries(
				queryClient,
				orgId,
				projectId,
				issueNumber,
			);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

export const uploadCommentAttachment = async (
	orgId: string,
	projectId: string,
	issueNumber: number,
	commentId: string,
	{
		file,
		signal,
	}: {
		file: File;
		signal?: AbortSignal;
	},
) => {
	const contentType = resolveContentType(file);
	await uploadViaPresign<AttachmentWithUrlDto>({
		file,
		contentType,
		signal,
		presign: () =>
			client.api.orgs[":orgId"].projects[":projectId"].issues[
				":number"
			].comments[":commentId"].attachments.presign.$post({
				param: {
					orgId,
					projectId,
					number: String(issueNumber),
					commentId,
				},
				json: { filename: file.name, contentType, size: file.size },
			}),
		register: (key) =>
			client.api.orgs[":orgId"].projects[":projectId"].issues[
				":number"
			].comments[":commentId"].attachments.$post({
				param: {
					orgId,
					projectId,
					number: String(issueNumber),
					commentId,
				},
				json: { key, filename: file.name, contentType, size: file.size },
			}),
	});
};

export const deleteCommentAttachment = (
	orgId: string,
	projectId: string,
	issueNumber: number,
	commentId: string,
	attachmentId: string,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[":number"].comments[
			":commentId"
		].attachments[":attachmentId"].$delete({
			param: {
				orgId,
				projectId,
				number: String(issueNumber),
				commentId,
				attachmentId,
			},
		}),
	);

export const deleteAttachment = (
	orgId: string,
	projectId: string,
	issueNumber: number,
	attachmentId: string,
) =>
	unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[
			":number"
		].attachments[":attachmentId"].$delete({
			param: {
				orgId,
				projectId,
				number: String(issueNumber),
				attachmentId,
			},
		}),
	);

export function useDeleteAttachment(
	orgId: string,
	projectId: string,
	issueNumber: number,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof deleteAttachment>>,
		string
	>,
) {
	const queryClient = useQueryClient();

	return useMutation({
		...callbacks,
		mutationFn: (input: string) =>
			deleteAttachment(orgId, projectId, issueNumber, input),
		onSuccess: (...args) => {
			void invalidateAttachmentQueries(
				queryClient,
				orgId,
				projectId,
				issueNumber,
			);
			return callbacks?.onSuccess?.(...args);
		},
	});
}

const EXTENSION_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	pdf: "application/pdf",
	txt: "text/plain",
	md: "text/markdown",
	markdown: "text/markdown",
	zip: "application/zip",
};
export const resolveContentType = (file: File): string => {
	if (file.type === "image/jpg") {
		return "image/jpeg";
	}
	if (file.type) {
		return file.type;
	}
	const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
	return EXTENSION_TYPES[ext] ?? "";
};
export const invalidateAttachmentQueries = (
	client: QueryClient,
	orgId: string,
	projectId: string,
	issueNumber: number,
) =>
	Promise.all([
		client.invalidateQueries({
			queryKey: attachmentsQueryKey(orgId, projectId, issueNumber),
		}),
		client.invalidateQueries({
			queryKey: issueActivitiesKey(orgId, projectId, issueNumber),
		}),
		client.invalidateQueries({ queryKey: orgActivitiesRootKey(orgId) }),
		client.invalidateQueries({ queryKey: billingRootKey(orgId) }),
	]);
