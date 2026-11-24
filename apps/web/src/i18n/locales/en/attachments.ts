const attachments = {
	megabytes: "{{value}} MB",
	title: "Attachments",
	add: "Add files",
	dropHint: "Drag & drop files here, or click to browse",
	typeLimit: "PNG, JPEG, WebP, GIF, PDF, TXT, Markdown, ZIP · up to {{size}}",
	typeNotAllowed: '"{{filename}}" has an unsupported file type.',
	tooLarge: '"{{filename}}" is larger than the size limit for your plan.',
	uploadFailed: 'Failed to upload "{{filename}}".',
	uploading: "Uploading {{filename}}…",
	cancelled: '"{{filename}}" upload was cancelled.',
	deleteTitle: "Delete attachment?",
	deleteDescription: '"{{filename}}" will be permanently deleted.',
	storageUnavailable:
		"Couldn't reach the file storage service — check the S3 configuration.",
	quotaExceeded:
		"This organization has reached its storage or attachment limit.",
};

export default attachments;
