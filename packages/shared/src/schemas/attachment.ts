import { z } from "zod";

export const ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024;

export const ATTACHMENT_CONTENT_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"application/pdf",
	"text/plain",
	"text/markdown",
	"application/zip",
] as const;

export const attachmentPresignSchema = z.object({
	filename: z.string().trim().min(1).max(255),
	contentType: z.string().trim().min(1).max(100),
});

export const registerAttachmentSchema = z.object({
	key: z.string().min(1).max(500),
	filename: z.string().trim().min(1).max(255),
	contentType: z.string().trim().min(1).max(100),
	size: z
		.number()
		.int()
		.min(1)
		.max(ATTACHMENT_MAX_SIZE, "File size exceeds the 10MB limit"),
});

export type AttachmentPresignInput = z.infer<typeof attachmentPresignSchema>;

export type RegisterAttachmentInput = z.infer<typeof registerAttachmentSchema>;
