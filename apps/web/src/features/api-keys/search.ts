import { z } from "zod";

export const apiKeysSearchSchema = z.object({
	page: z.coerce.number().int().positive().optional().catch(1),
});
