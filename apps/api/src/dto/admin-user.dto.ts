import type { Paginated } from "@workspace/shared";

export type AdminUserRole = "admin" | "user";

export type AdminUserDto = {
	id: string;
	name: string;
	email: string;
	image: string | null;
	emailVerified: boolean;
	role: string;
	banned: boolean | null;
	banReason: string | null;
	banExpires: string | null;
	createdAt: string;
	updatedAt: string;
};

export type ListAdminUsersQueryDto = {
	page: number;
	pageSize: number;
	search: string;
};

export type ListAdminUsersDto = Paginated<AdminUserDto>;
