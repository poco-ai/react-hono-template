import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { UserDao } from "../dao/user.dao";

export const createUserService = (dao: UserDao) => ({
	listUsers: () => dao.list(),
	getUser: async (id: number) => {
		const user = await dao.findById(id);
		if (!user) {
			throw new ApiError(404, ApiErrorCode.NOT_FOUND, `User ${id} not found`);
		}
		return user;
	},
});

export type UserService = ReturnType<typeof createUserService>;
