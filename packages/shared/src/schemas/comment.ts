import { z } from "zod";

export const createCommentSchema = z.object({
	body: z.string().trim().min(1).max(10000),
});

export const commentListQuerySchema = z.object({
	page: z.coerce.number().int().min(1).max(10000).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export type CommentListQuery = z.infer<typeof commentListQuerySchema>;
