import type { AttachmentWithUrlDto } from "@api/features/attachments/dto/attachment.dto";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import {
	attachmentsQueryKey,
	billingRootKey,
	commentsQueryKey,
	issueActivitiesKey,
	issueSubscriptionKey,
	orgActivitiesRootKey,
} from "@/features/keys";
import { activeOrganizationId } from "@/features/organizations/data";
import { client, unwrap } from "@/lib/api";
import { errorCode } from "@/lib/errors";
import { useInvalidatingMutation } from "@/lib/feature-mutation";
import { isMediaAssetUrl } from "@/lib/media";
import type { MutationCallbacks } from "@/lib/mutation-callbacks";
import {
	imageContentType,
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
	return useInvalidatingMutation({
		mutationFn: (input: { file: File; signal: AbortSignal }) =>
			uploadAttachment(orgId, projectId, issueNumber, input),
		invalidate: (queryClient) =>
			invalidateAttachmentQueries(queryClient, orgId, projectId, issueNumber),
		callbacks,
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

/** Uploads every draft file for one comment; abort errors propagate. */
export async function uploadCommentAttachments(
	orgId: string,
	projectId: string,
	issueNumber: number,
	commentId: string,
	files: readonly File[],
	signal: AbortSignal,
): Promise<{ file: File; error: unknown }[]> {
	const failed: { file: File; error: unknown }[] = [];
	for (const file of files) {
		try {
			await uploadCommentAttachment(orgId, projectId, issueNumber, commentId, {
				file,
				signal,
			});
		} catch (error) {
			if (isAbortError(error)) throw error;
			failed.push({ file, error });
		}
	}
	return failed;
}

export function useDeleteCommentAttachment(
	orgId: string,
	projectId: string,
	issueNumber: number,
	callbacks?: MutationCallbacks<
		Awaited<ReturnType<typeof deleteCommentAttachment>>,
		{ commentId: string; attachmentId: string }
	>,
) {
	return useInvalidatingMutation({
		mutationFn: (input: { commentId: string; attachmentId: string }) =>
			deleteCommentAttachment(
				orgId,
				projectId,
				issueNumber,
				input.commentId,
				input.attachmentId,
			),
		invalidate: (queryClient) =>
			Promise.all([
				invalidateAttachmentQueries(queryClient, orgId, projectId, issueNumber),
				queryClient.invalidateQueries({
					queryKey: commentsQueryKey(orgId, projectId, issueNumber),
				}),
				queryClient.invalidateQueries({
					queryKey: issueActivitiesKey(orgId, projectId, issueNumber),
				}),
				queryClient.invalidateQueries({
					queryKey: orgActivitiesRootKey(orgId),
				}),
				queryClient.invalidateQueries({
					queryKey: issueSubscriptionKey(orgId, projectId, issueNumber),
				}),
			]),
		callbacks,
	});
}

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
	return useInvalidatingMutation({
		mutationFn: (input: string) =>
			deleteAttachment(orgId, projectId, issueNumber, input),
		invalidate: (queryClient) =>
			invalidateAttachmentQueries(queryClient, orgId, projectId, issueNumber),
		callbacks,
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

/** Uploads the signed-in user's avatar through the media endpoints. */
export async function uploadAvatar(file: File): Promise<string> {
	const contentType = imageContentType(file);
	const registered = await uploadViaPresign<{ url: string }>({
		file,
		contentType,
		presign: () =>
			client.api.me.avatar.presign.$post({
				json: {
					filename: file.name || `avatar.${contentType.split("/")[1]}`,
					contentType,
					size: file.size,
				},
			}),
		register: (key) => client.api.me.avatar.$post({ json: { key } }),
	});
	return registered.url;
}

/** Deletes a media-backed avatar; OAuth/legacy URLs are left untouched. */
export async function deleteAvatar(url: string): Promise<void> {
	if (!isMediaAssetUrl(url)) return;
	try {
		await unwrap(client.api.me.avatar.$delete({ json: { url } }));
	} catch (error) {
		const code = errorCode(error);
		if (code === "ASSET_NOT_FOUND" || code === "VALIDATION") return;
		throw error;
	}
}

/** Uploads the active organization's logo through the media endpoints. */
export async function uploadOrganizationLogo(file: File): Promise<string> {
	const orgId = await activeOrganizationId();
	const contentType = imageContentType(file);
	const registered = await uploadViaPresign<{ url: string }>({
		file,
		contentType,
		presign: () =>
			client.api.orgs[":orgId"].logo.presign.$post({
				param: { orgId },
				json: {
					filename: file.name || `logo.${contentType.split("/")[1]}`,
					contentType,
					size: file.size,
				},
			}),
		register: (key) =>
			client.api.orgs[":orgId"].logo.$post({
				param: { orgId },
				json: { key },
			}),
	});
	return registered.url;
}

/** Deletes a media-backed organization logo. */
export async function deleteOrganizationLogo(url: string): Promise<void> {
	if (!isMediaAssetUrl(url)) return;
	try {
		const orgId = await activeOrganizationId();
		await unwrap(
			client.api.orgs[":orgId"].logo.$delete({
				param: { orgId },
				json: { url },
			}),
		);
	} catch (error) {
		const code = errorCode(error);
		if (code === "ASSET_NOT_FOUND" || code === "VALIDATION") return;
		throw error;
	}
}
