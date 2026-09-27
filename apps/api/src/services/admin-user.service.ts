import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { AdminUserDao } from "../dao/admin-user.dao";
import type {
	AdminUserRole,
	ListAdminUsersQueryDto,
} from "../dto/admin-user.dto";

export const createAdminUserService = (dao: AdminUserDao) => ({
	listUsers: (query: ListAdminUsersQueryDto) => dao.list(query),

	updateRole: async (
		actorId: string,
		targetId: string,
		role: AdminUserRole,
	) => {
		if (targetId === actorId) {
			throw new ApiError(
				403,
				ApiErrorCode.FORBIDDEN,
				"You cannot change your own role",
			);
		}
		const target = await dao.findById(targetId);
		if (!target) {
			throw new ApiError(
				404,
				ApiErrorCode.NOT_FOUND,
				`User ${targetId} not found`,
			);
		}
		return dao.updateRole(targetId, role);
	},

	banUser: async (actorId: string, targetId: string, banReason?: string) => {
		const target = await dao.findById(targetId);
		if (!target) {
			throw new ApiError(
				404,
				ApiErrorCode.NOT_FOUND,
				`User ${targetId} not found`,
			);
		}
		if (target.id === actorId) {
			throw new ApiError(
				403,
				ApiErrorCode.FORBIDDEN,
				"You cannot ban yourself",
			);
		}
		if (target.role === "admin") {
			throw new ApiError(
				403,
				ApiErrorCode.FORBIDDEN,
				"You cannot ban an admin",
			);
		}
		return dao.ban(targetId, {
			banReason: banReason ?? null,
			banExpires: null,
		});
	},

	unbanUser: async (targetId: string) => {
		const target = await dao.findById(targetId);
		if (!target) {
			throw new ApiError(
				404,
				ApiErrorCode.NOT_FOUND,
				`User ${targetId} not found`,
			);
		}
		return dao.unban(targetId);
	},
});

export type AdminUserService = ReturnType<typeof createAdminUserService>;
