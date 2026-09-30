import { ApiError, ApiErrorCode, PLANS } from "@workspace/shared";
import type { AdminUserDao } from "../dao/admin-user.dao";
import type { MemberDao } from "../dao/member.dao";
import type { PlanService } from "./plan.service";

export const createAuthPolicyService = ({
	adminUserDao,
	memberDao,
	plans,
}: {
	adminUserDao: Pick<AdminUserDao, "countUsers">;
	memberDao: Pick<
		MemberDao,
		| "listOrgPlansByUser"
		| "findInvitationOrgId"
		| "countByOrg"
		| "countPendingInvitationsByOrg"
	>;
	plans: Pick<PlanService, "getPlanForOrg">;
}) => ({
	initialUserRole: async () =>
		(await adminUserDao.countUsers()) === 0 ? "admin" : "user",

	assertCanCreateOrganization: async (userId: string) => {
		const orgPlans = await memberDao.listOrgPlansByUser(userId);
		const plan = orgPlans.includes("pro") ? "pro" : "free";
		if (orgPlans.length >= PLANS[plan].orgs) {
			throw new ApiError(
				403,
				ApiErrorCode.PLAN_LIMIT_EXCEEDED,
				`Plan limit reached: the ${plan} plan allows belonging to ${PLANS[plan].orgs} organization(s). Upgrade to create more organizations.`,
			);
		}
	},

	assertCanAcceptInvitation: async (invitationId?: string) => {
		const orgId = invitationId
			? await memberDao.findInvitationOrgId(invitationId)
			: null;
		if (!orgId) return;
		const plan = await plans.getPlanForOrg(orgId);
		const memberCount = await memberDao.countByOrg(orgId);
		if (memberCount >= PLANS[plan].members) {
			throw new ApiError(
				403,
				ApiErrorCode.PLAN_LIMIT_EXCEEDED,
				`Plan limit reached: the ${plan} plan allows up to ${PLANS[plan].members} members and this organization is full.`,
			);
		}
	},

	assertCanInviteMember: async (orgId: string) => {
		const plan = await plans.getPlanForOrg(orgId);
		const memberCount =
			(await memberDao.countByOrg(orgId)) +
			(await memberDao.countPendingInvitationsByOrg(orgId));
		if (memberCount >= PLANS[plan].members) {
			throw new ApiError(
				403,
				ApiErrorCode.PLAN_LIMIT_EXCEEDED,
				`Plan limit reached: the ${plan} plan allows up to ${PLANS[plan].members} members (including pending invitations). Upgrade to invite more members.`,
			);
		}
	},
});

export type AuthPolicyService = ReturnType<typeof createAuthPolicyService>;
