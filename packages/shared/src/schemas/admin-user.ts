import { z } from "zod";
import { paginationQueryShape } from "./pagination";

export const adminUserListQuerySchema = z.object({
	...paginationQueryShape(10),
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
