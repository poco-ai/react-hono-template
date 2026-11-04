import { z } from "zod";
import { paginationQueryShape } from "./pagination";
import { PROJECT_HEALTH_VALUES } from "./project";

export const PROJECT_UPDATE_BODY_MAX = 5000;

const projectUpdateBody = z.string().trim().min(1).max(PROJECT_UPDATE_BODY_MAX);

const projectUpdateHealth = z.enum(PROJECT_HEALTH_VALUES);

export const createProjectUpdateSchema = z.object({
	body: projectUpdateBody,
	health: projectUpdateHealth.nullish(),
});

export const updateProjectUpdateSchema = z.object({
	body: projectUpdateBody.optional(),
	health: projectUpdateHealth.nullish(),
});

export const projectUpdateListQuerySchema = z.object({
	...paginationQueryShape(20),
});

export type CreateProjectUpdateInput = z.infer<
	typeof createProjectUpdateSchema
>;
export type UpdateProjectUpdateInput = z.infer<
	typeof updateProjectUpdateSchema
>;
export type ProjectUpdateListQuery = z.infer<
	typeof projectUpdateListQuerySchema
>;
