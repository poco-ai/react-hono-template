import { z } from "zod";
import { COMMENT_REACTION_EMOJIS } from "../notifications";
import { paginationQueryShape } from "./pagination";

export const createCommentSchema = z.object({
	body: z.string().trim().min(1).max(10000),
	/** Reply target. Replies may only point at a top-level comment. */
	parentId: z.string().min(1).nullish(),
});

export const updateCommentSchema = z.object({
	body: z.string().trim().min(1).max(10000),
});

export const commentListQuerySchema = z.object({
	...paginationQueryShape(20),
});

export const commentReactionSchema = z.object({
	emoji: z.enum(COMMENT_REACTION_EMOJIS),
});

export const resolveCommentSchema = z.object({
	resolved: z.boolean(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export type CommentListQuery = z.infer<typeof commentListQuerySchema>;

export type CommentReactionInput = z.infer<typeof commentReactionSchema>;

export type ResolveCommentInput = z.infer<typeof resolveCommentSchema>;
