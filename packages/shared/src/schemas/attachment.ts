import { z } from "zod";
import { ATTACHMENT_MAX_SIZE, attachmentMaxSizeMessage } from "../constants";

export {
	ATTACHMENT_CONTENT_TYPES,
	ATTACHMENT_MAX_SIZE,
	attachmentMaxSizeMessage,
} from "../constants";

export const attachmentPresignSchema = z.object({
	filename: z.string().trim().min(1).max(255),
	contentType: z.string().trim().min(1).max(100),
	size: z
		.number()
		.int()
		.min(1)
		.max(ATTACHMENT_MAX_SIZE, attachmentMaxSizeMessage),
});

export const registerAttachmentSchema = z.object({
	key: z.string().min(1).max(500),
	filename: z.string().trim().min(1).max(255),
	contentType: z.string().trim().min(1).max(100),
	size: z
		.number()
		.int()
		.min(1)
		.max(ATTACHMENT_MAX_SIZE, attachmentMaxSizeMessage),
});

export type AttachmentPresignInput = z.infer<typeof attachmentPresignSchema>;

export type RegisterAttachmentInput = z.infer<typeof registerAttachmentSchema>;
