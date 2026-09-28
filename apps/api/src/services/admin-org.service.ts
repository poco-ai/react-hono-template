import {
	type AdminOrgListQuery,
	ApiError,
	ApiErrorCode,
} from "@workspace/shared";
import type { OrganizationDao } from "../dao/organization.dao";
import type { AdminStatsDto, ListAdminOrgsDto } from "../dto/admin-org.dto";

export const createAdminOrgService = (dao: OrganizationDao) => ({
	listOrgs: (query: AdminOrgListQuery): Promise<ListAdminOrgsDto> =>
		dao.list({
			page: query.page,
			pageSize: query.pageSize,
			search: query.search ?? "",
		}),

	freeze: async (orgId: string) => {
		if (!(await dao.findById(orgId))) {
			throw new ApiError(
				404,
				ApiErrorCode.NOT_FOUND,
				`Organization ${orgId} not found`,
			);
		}
		return dao.updateFrozen(orgId, true);
	},

	unfreeze: async (orgId: string) => {
		if (!(await dao.findById(orgId))) {
			throw new ApiError(
				404,
				ApiErrorCode.NOT_FOUND,
				`Organization ${orgId} not found`,
			);
		}
		return dao.updateFrozen(orgId, false);
	},

	stats: (): Promise<AdminStatsDto> => dao.getStats(),
});

export type AdminOrgService = ReturnType<typeof createAdminOrgService>;
