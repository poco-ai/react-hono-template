import { z } from "zod";

export const adminOrgListQuerySchema = z.object({
	page: z.coerce.number().int().min(1).max(10000).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(20),
	search: z.string().trim().max(200).optional(),
});

export type AdminOrgListQuery = z.infer<typeof adminOrgListQuerySchema>;
