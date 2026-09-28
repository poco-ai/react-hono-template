import { z } from "zod";

export const adminUserListQuerySchema = z.object({
	page: z.coerce.number().int().min(1).max(10000).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(10),
	search: z.string().trim().max(100).optional(),
});

export const updateAdminUserRoleSchema = z.object({
	role: z.enum(["admin", "user"]),
});

export const banAdminUserSchema = z.object({
	banReason: z.string().trim().max(200).optional(),
});

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export type UpdateAdminUserRoleInput = z.infer<
	typeof updateAdminUserRoleSchema
>;

export type BanAdminUserInput = z.infer<typeof banAdminUserSchema>;
