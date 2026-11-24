import { z } from "zod";
import { FAVORITE_ENTITY_TYPES } from "../constants";

export const createFavoriteSchema = z.object({
	entityType: z.enum(FAVORITE_ENTITY_TYPES),
	entityId: z.string().min(1),
});

export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;
