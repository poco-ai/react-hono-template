import { z } from "zod";

/** Entities a member can pin to their personal favorites list. */
export const FAVORITE_ENTITY_TYPES = ["issue", "project"] as const;

export type FavoriteEntityType = (typeof FAVORITE_ENTITY_TYPES)[number];

export const createFavoriteSchema = z.object({
	entityType: z.enum(FAVORITE_ENTITY_TYPES),
	entityId: z.string().min(1),
});

export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;
