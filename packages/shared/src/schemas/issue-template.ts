import { z } from "zod";
import { ISSUE_PRIORITY } from "../constants";

export const ISSUE_TEMPLATE_NAME_MAX_LENGTH = 100;

const templateNameSchema = z
	.string()
	.trim()
	.min(1)
	.max(ISSUE_TEMPLATE_NAME_MAX_LENGTH);

/**
 * Issue templates only store creation-time defaults. Applying a template to
 * prefill the issue form happens in the client; the API never creates issues
 * from a template.
 */
export const createIssueTemplateSchema = z.object({
	name: templateNameSchema,
	/** Omit or pass null for an organization-wide template. */
	projectId: z.string().min(1).nullish(),
	title: z.string().trim().min(1).max(500),
	description: z.string().max(20000).nullish(),
	statusId: z.string().min(1).nullish(),
	priority: z
		.number()
		.int()
		.min(ISSUE_PRIORITY.none)
		.max(ISSUE_PRIORITY.low)
		.nullish(),
	labelIds: z.array(z.string().min(1)).max(20).optional(),
	estimate: z.number().int().min(0).max(100).nullish(),
});

export const updateIssueTemplateSchema = createIssueTemplateSchema.partial();

/** Optional project scoping for the template list. */
export const issueTemplateListQuerySchema = z.object({
	projectId: z.string().min(1).optional(),
});

export type CreateIssueTemplateInput = z.infer<
	typeof createIssueTemplateSchema
>;

export type UpdateIssueTemplateInput = z.infer<
	typeof updateIssueTemplateSchema
>;

export type IssueTemplateListQuery = z.infer<
	typeof issueTemplateListQuerySchema
>;
