import { z } from "zod";

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
});

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
});

export const labelSchema = z.object({
	id: z.string(),
	orgId: z.string(),
	name: z.string(),
	color: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const issueListSchema = z.object({
	items: z.array(issueSchema),
	total: z.number(),
	page: z.number(),
	pageSize: z.number(),
});

export const deletedSchema = z.object({
	deleted: z.boolean(),
});

export const errorSchema = z.object({
	ok: z.literal(false),
	error: z.object({
		code: z.string(),
		message: z.string(),
	}),
});

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

export const issueQuerySchema = z.object({
	projectId: z.string().optional(),
	status: z.string().optional(),
	priority: z.string().optional(),
	assigneeId: z.string().optional(),
	labelId: z.string().optional(),
	search: z.string().optional(),
	sort: z.string().optional(),
	page: z.string().optional(),
	pageSize: z.string().optional(),
});
