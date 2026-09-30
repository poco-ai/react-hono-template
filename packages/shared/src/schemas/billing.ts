import { z } from "zod";
import { paginationQueryShape } from "./pagination";

export const adminOrgListQuerySchema = z.object({
	...paginationQueryShape(20),
	search: z.string().trim().max(200).optional(),
});

export type AdminOrgListQuery = z.infer<typeof adminOrgListQuerySchema>;
