import { useQuery } from "@tanstack/react-query";
import { ATTACHMENT_MAX_SIZE } from "@workspace/shared";
import { IssueAttachments } from "@/features/attachments/components/issue-attachments";
import {
	attachmentUploadErrorKey,
	deleteAvatar,
	deleteOrganizationLogo,
	uploadAvatar,
	uploadCommentAttachments,
	uploadOrganizationLogo,
	useDeleteCommentAttachment,
} from "@/features/attachments/data";
import { useAttachmentDraft } from "@/features/attachments/use-attachment-draft";
import { billingQuery } from "@/features/billing/data";
import type {
	CommentAttachmentExtras,
	IssueDetailContext,
	WebFeatureDecl,
} from "@/features/web-types";

function IssueAttachmentsSection(context: IssueDetailContext) {
	return (
		<IssueAttachments
			orgId={context.orgId}
			projectId={context.projectId}
			issueNumber={context.issueNumber}
			frozen={context.frozen}
		/>
	);
}

function useAttachmentMaxSize(orgId: string): number {
	const billing = useQuery(billingQuery(orgId));
	return billing.data?.limits.attachmentMaxSize ?? ATTACHMENT_MAX_SIZE;
}

const commentExtras: CommentAttachmentExtras = {
	useDraft: (maxSize) => useAttachmentDraft({ maxSize }),
	useMaxSize: useAttachmentMaxSize,
	useDeleteAttachment: (orgId, projectId, issueNumber, callbacks) =>
		useDeleteCommentAttachment(orgId, projectId, issueNumber, callbacks),
	uploadErrorKey: (error) => attachmentUploadErrorKey(error),
	uploadFiles: (orgId, projectId, issueNumber, commentId, files, signal) =>
		uploadCommentAttachments(
			orgId,
			projectId,
			issueNumber,
			commentId,
			files,
			signal,
		),
};

/** Attachments contribute UI inside issues/comments; they own `attachments` strings. */
export const attachmentsWeb: WebFeatureDecl = {
	id: "attachments",
	i18nNamespaces: ["attachments"],
	commentExtras,
	mediaActions: {
		uploadAvatar,
		deleteAvatar,
		uploadOrganizationLogo,
		deleteOrganizationLogo,
	},
	issueDetailSections: [
		{ id: "attachments", order: 30, component: IssueAttachmentsSection },
	],
};
