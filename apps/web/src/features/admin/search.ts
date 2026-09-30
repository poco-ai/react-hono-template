import { z } from "zod";

export const adminUsersSearchSchema = z.object({
	page: z.coerce.number().int().min(1).optional().catch(1),
	search: z.string().optional().catch(""),
});

export const adminOrgsSearchSchema = z.object({
	page: z.coerce.number().int().min(1).optional().catch(1),
	search: z.string().optional().catch(""),
});
