export type AttachmentUploaderDto = {
	id: string;
	name: string;
	email: string;
	image: string | null;
};

export type AttachmentDto = {
	id: string;
	orgId: string;
	issueId: string;
	key: string;
	filename: string;
	contentType: string;
	size: number;
	uploader: AttachmentUploaderDto | null;
	createdAt: string;
};

export type AttachmentWithUrlDto = AttachmentDto & {
	url: string | null;
};

export type PresignAttachmentResponseDto = {
	key: string;
	uploadUrl: string;
	expiresIn: number;
};
