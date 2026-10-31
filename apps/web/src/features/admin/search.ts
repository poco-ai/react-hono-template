import { z } from "zod";

export const adminUsersSearchSchema = z.object({
	field: z.enum(["email", "name"]).optional().catch("email"),
	operator: z
		.enum(["contains", "starts_with", "ends_with"])
		.optional()
		.catch("contains"),
	status: z.enum(["all", "active", "banned"]).optional().catch("all"),
	sort: z.enum(["createdAt", "name"]).optional().catch("createdAt"),
	direction: z.enum(["asc", "desc"]).optional().catch("desc"),
	page: z.coerce.number().int().min(1).optional().catch(1),
	search: z.string().optional().catch(""),
});

export const adminOrgsSearchSchema = z.object({
	page: z.coerce.number().int().min(1).optional().catch(1),
	search: z.string().optional().catch(""),
});
