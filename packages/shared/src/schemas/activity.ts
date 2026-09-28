import { z } from "zod";

export const activityListQuerySchema = z.object({
	projectId: z.string().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
