import { z } from "zod";

export const projectsSearchSchema = z.object({
	archived: z.coerce.boolean().optional().catch(false),
});
