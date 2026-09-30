import type { AdminUserDao } from "../dao/admin-user.dao";
import type { BootstrapDto } from "../dto/bootstrap.dto";

export const createBootstrapService = (dao: AdminUserDao) => ({
	getBootstrap: async (): Promise<BootstrapDto> => ({
		hasAdmin: await dao.hasAdminUser(),
	}),
});

export type BootstrapService = ReturnType<typeof createBootstrapService>;
