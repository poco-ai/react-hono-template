import { z } from "zod";
import { ISSUE_QUERY_LAYOUTS, issueQuerySchema } from "./issue-query";

export const VIEW_NAME_MAX_LENGTH = 100;
export const VIEW_DESCRIPTION_MAX_LENGTH = 500;

const viewNameSchema = z.string().trim().min(1).max(VIEW_NAME_MAX_LENGTH);

const viewDescriptionSchema = z
	.string()
	.trim()
	.max(VIEW_DESCRIPTION_MAX_LENGTH)
	.nullish();

export const createViewSchema = z.object({
	name: viewNameSchema,
	description: viewDescriptionSchema,
	/** Project scope; omit or pass null for an organization-wide view. */
	projectId: z.string().min(1).nullish(),
	/** Shared views are visible to every organization member. */
	shared: z.boolean().optional(),
	/** Owner-scoped default view (one per owner). */
	isDefault: z.boolean().optional(),
	query: issueQuerySchema,
	layout: z.enum(ISSUE_QUERY_LAYOUTS).default("list"),
});

export const updateViewSchema = z.object({
	name: viewNameSchema.optional(),
	description: viewDescriptionSchema,
	projectId: z.string().min(1).nullish(),
	shared: z.boolean().optional(),
	isDefault: z.boolean().optional(),
	query: issueQuerySchema.optional(),
	layout: z.enum(ISSUE_QUERY_LAYOUTS).optional(),
});

/** Optional project scoping for the view list. */
export const viewListQuerySchema = z.object({
	projectId: z.string().min(1).optional(),
});

export type CreateViewInput = z.infer<typeof createViewSchema>;

export type UpdateViewInput = z.infer<typeof updateViewSchema>;

export type ViewListQuery = z.infer<typeof viewListQuerySchema>;
