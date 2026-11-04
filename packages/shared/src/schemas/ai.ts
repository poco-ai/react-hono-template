import { z } from "zod";

/**
 * AI chat request schemas.
 *
 * Messages are validated structurally only: the exact UI message part shapes
 * belong to the AI SDK (`UIMessage`), which this package intentionally does not
 * depend on. The API casts the validated value to `UIMessage[]`.
 */

export const AI_CONTEXT_TYPES = ["issue", "project"] as const;

export type AiContextType = (typeof AI_CONTEXT_TYPES)[number];

const contextShape = {
	type: z.enum(AI_CONTEXT_TYPES).optional(),
	id: z.string().min(1).optional(),
};

const bothOrNeither = (a: unknown, b: unknown): boolean =>
	(a === undefined) === (b === undefined);

export const aiContextSchema = z
	.object(contextShape)
	.refine((value) => bothOrNeither(value.type, value.id), {
		message: "Provide both context.type and context.id, or neither.",
	});

export const createAiConversationSchema = z
	.object({
		title: z.string().trim().min(1).max(120).optional(),
		contextType: z.enum(AI_CONTEXT_TYPES).optional(),
		contextId: z.string().min(1).optional(),
	})
	.refine((value) => bothOrNeither(value.contextType, value.contextId), {
		message: "Provide both contextType and contextId, or neither.",
	});

export const updateAiConversationSchema = z.object({
	title: z.string().trim().min(1).max(120).optional(),
	pinned: z.boolean().optional(),
});

export const aiConversationListQuerySchema = z.object({
	cursor: z.string().trim().max(200).optional(),
	search: z.string().trim().max(100).optional(),
	limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const aiUiMessageSchema = z.looseObject({
	id: z.string().min(1).max(200),
	role: z.enum(["system", "user", "assistant"]),
	parts: z.array(z.unknown()).max(2000),
});

export const aiChatRequestSchema = z.object({
	conversationId: z.string().min(1),
	messages: z.array(aiUiMessageSchema).min(1).max(200),
	context: aiContextSchema.optional(),
	timezone: z.string().trim().min(1).max(64).optional(),
});

export const updateOrgAiSettingsSchema = z.object({
	enabled: z.boolean().optional(),
	defaultModel: z.string().trim().min(1).max(120).nullable().optional(),
	retentionDays: z.number().int().min(1).max(3650).optional(),
	strictMcpWrites: z.boolean().optional(),
});

export type CreateAiConversationInput = z.infer<
	typeof createAiConversationSchema
>;
export type UpdateAiConversationInput = z.infer<
	typeof updateAiConversationSchema
>;
export type AiConversationListQuery = z.infer<
	typeof aiConversationListQuerySchema
>;
export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;
export type UpdateOrgAiSettingsInput = z.infer<
	typeof updateOrgAiSettingsSchema
>;
