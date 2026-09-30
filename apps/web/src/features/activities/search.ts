import { z } from "zod";

export const orgActivitySearchSchema = z.object({
	projectId: z.string().optional().catch(""),
});
