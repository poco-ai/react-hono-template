import { z } from "zod";

export const createProjectSchema = z.object({
	name: z.string().trim().min(1).max(100),
	key: z.string().regex(/^[A-Z]{2,6}$/),
	description: z.string().max(2000).optional(),
	color: z.string().max(64).optional(),
});

export const updateProjectSchema = z.object({
	name: z.string().trim().min(1).max(100).optional(),
	key: z
		.string()
		.regex(/^[A-Z]{2,6}$/)
		.optional(),
	description: z.string().max(2000).nullish(),
	color: z.string().max(64).nullish(),
	archived: z.boolean().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
