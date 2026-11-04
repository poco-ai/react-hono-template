import { z } from "zod";

/** Project health rollup values reported on the project and its updates. */
export const PROJECT_HEALTH_VALUES = [
	"on_track",
	"at_risk",
	"off_track",
] as const;

export type ProjectHealth = (typeof PROJECT_HEALTH_VALUES)[number];

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
	/** Target completion date for the project. */
	targetDate: z.iso.datetime().nullish(),
	/** Project lead; must be a member of the organization. */
	leadId: z.string().min(1).nullish(),
	health: z.enum(PROJECT_HEALTH_VALUES).nullish(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
