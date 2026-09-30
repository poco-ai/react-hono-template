import type { ApiErr } from "@workspace/shared";
import { z } from "zod";
import type { IssueDetailDto, ListIssuesDto } from "../dto/issue.dto";
import type { LabelDto } from "../dto/label.dto";
import type { ProjectDto } from "../dto/project.dto";

/**
 * OpenAPI response schemas for the public v1 API. Each schema is compile-bound
 * to its internal counterpart with `satisfies z.ZodType<...>`: adding, removing
 * or retyping a DTO field breaks the build instead of silently drifting from
 * the generated document. Request schemas are taken from @workspace/shared
 * directly in the route files.
 */
export const projectSchema = z.object({
	id: z.string(),
	orgId: z.string(),
	name: z.string(),
	key: z.string(),
	description: z.string().nullable(),
	color: z.string().nullable(),
	archived: z.boolean(),
	nextNumber: z.number(),
	createdAt: z.string(),
	updatedAt: z.string(),
}) satisfies z.ZodType<ProjectDto>;

export const issueSchema = z.object({
	id: z.string(),
	orgId: z.string(),
	projectId: z.string(),
	number: z.number(),
	title: z.string(),
	description: z.string().nullable(),
	status: z.string(),
	priority: z.number(),
	assigneeId: z.string().nullable(),
	createdById: z.string().nullable(),
	dueDate: z.string().nullable(),
	estimate: z.number().nullable(),
	deletedAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	labelIds: z.array(z.string()),
}) satisfies z.ZodType<IssueDetailDto>;

export const labelSchema = z.object({
	id: z.string(),
	orgId: z.string(),
	name: z.string(),
	color: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
}) satisfies z.ZodType<LabelDto>;

export const issueListSchema = z.object({
	items: z.array(issueSchema),
	total: z.number(),
	page: z.number(),
	pageSize: z.number(),
}) satisfies z.ZodType<ListIssuesDto>;

export const deletedSchema = z.object({
	deleted: z.boolean(),
});

export const errorSchema = z.object({
	ok: z.literal(false),
	error: z.object({
		code: z.string(),
		message: z.string(),
	}),
}) satisfies z.ZodType<ApiErr>;

export const envelope = <T extends z.ZodType>(schema: T) =>
	z.object({
		ok: z.literal(true),
		data: schema,
	});

export const jsonOk = <T extends z.ZodType>(schema: T) => ({
	description: "Success",
	content: { "application/json": { schema: envelope(schema) } },
});

export const jsonError = (description: string) => ({
	description,
	content: { "application/json": { schema: errorSchema } },
});
