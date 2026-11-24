import { ApiError, ApiErrorCode } from "@workspace/shared";
import type { MemberDao } from "../dao/member.dao";
import type { OrganizationDao } from "../dao/organization.dao";

export type VisibleOrg = {
	id: string;
	name: string;
	slug: string;
	frozen: boolean;
	plan?: string;
	role?: string;
};

/**
 * Organization visibility rules shared by the capability surfaces: API keys
 * only see their pinned organization, users see their memberships, and an
 * explicit org context sees that one organization.
 */
export const createOrganizationService = ({
	organizationDao,
	memberDao,
}: {
	organizationDao: Pick<OrganizationDao, "findById">;
	memberDao: Pick<MemberDao, "listMembershipsByUser">;
}) => ({
	listVisibleOrgs: async ({
		userId,
		keyId,
		orgId,
	}: {
		userId?: string;
		keyId?: string;
		orgId?: string;
	}): Promise<VisibleOrg[]> => {
		if (keyId) {
			if (!orgId) {
				throw new ApiError(
					ApiErrorCode.MCP_ORG_REQUIRED,
					"An organization is required for API key access.",
				);
			}
			const org = await organizationDao.findById(orgId);
			if (!org) {
				throw new ApiError(ApiErrorCode.NOT_FOUND, "Organization not found");
			}
			return [org];
		}
		if (userId) {
			return memberDao.listMembershipsByUser(userId);
		}
		if (orgId) {
			const org = await organizationDao.findById(orgId);
			if (!org) {
				throw new ApiError(ApiErrorCode.NOT_FOUND, "Organization not found");
			}
			return [org];
		}
		throw new ApiError(
			ApiErrorCode.MCP_ORG_REQUIRED,
			"An organization is required for API key access.",
		);
	},
});

export type OrganizationService = ReturnType<typeof createOrganizationService>;
