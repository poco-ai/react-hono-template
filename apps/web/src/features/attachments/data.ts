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
import { client, unwrap } from "@/lib/api";

import type { MutationCallbacks } from "@/lib/mutation-callbacks";

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
	const presigned = await unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[
			":number"
		].attachments.presign.$post({
			param: { orgId, projectId, number: String(issueNumber) },
			json: { filename: file.name, contentType },
		}),
	);
	const response = await fetch(presigned.uploadUrl, {
		method: "PUT",
		headers: { "Content-Type": contentType },
		body: file,
		signal,
	});
	if (!response.ok) {
		throw new Error(`Upload failed with status ${response.status}`);
	}
	await unwrap(
		client.api.orgs[":orgId"].projects[":projectId"].issues[
			":number"
		].attachments.$post({
			param: { orgId, projectId, number: String(issueNumber) },
			json: {
				key: presigned.key,
				filename: file.name,
				contentType,
				size: file.size,
			},
		}),
	);
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
	]);
