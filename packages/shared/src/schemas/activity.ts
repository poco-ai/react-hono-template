import { z } from "zod";

/** Upper bound for `offset` so a bad cursor cannot scan arbitrarily far. */
export const ACTIVITY_OFFSET_MAX = 10000;

/**
 * Paginated activity list. `offset` is additive: requests that only send
 * `limit` keep returning the newest page, and clients page by increasing
 * `offset` (the frontend uses `items.length === limit` as `hasMore`).
 */
export const activityListQuerySchema = z.object({
	projectId: z.string().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).max(ACTIVITY_OFFSET_MAX).default(0),
});

export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
