import { z } from "zod";

export const MEDIA_IMAGE_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
] as const;

export const MEDIA_MAX_SIZE = 2 * 1024 * 1024;

export type MediaImageType = (typeof MEDIA_IMAGE_TYPES)[number];

export const avatarPresignSchema = z.object({
	filename: z.string().trim().min(1).max(255),
	contentType: z.enum(MEDIA_IMAGE_TYPES),
	size: z.number().int().min(1).max(MEDIA_MAX_SIZE),
});

export const mediaRegisterSchema = z.object({
	key: z.string().min(1).max(500),
});

export const deleteMediaSchema = z.object({
	url: z.string().trim().min(1).max(2000),
});

export type AvatarPresignInput = z.infer<typeof avatarPresignSchema>;

export type MediaRegisterInput = z.infer<typeof mediaRegisterSchema>;

export type DeleteMediaInput = z.infer<typeof deleteMediaSchema>;
