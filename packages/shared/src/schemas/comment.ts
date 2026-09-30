import { z } from "zod";
import { paginationQueryShape } from "./pagination";

export const createCommentSchema = z.object({
	body: z.string().trim().min(1).max(10000),
});

export const commentListQuerySchema = z.object({
	...paginationQueryShape(20),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export type CommentListQuery = z.infer<typeof commentListQuerySchema>;
