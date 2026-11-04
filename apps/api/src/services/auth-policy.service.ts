import { ApiError, ApiErrorCode, PLANS } from "@workspace/shared";
import type { AdminUserDao } from "../dao/admin-user.dao";
import type { MemberDao } from "../dao/member.dao";
import type { PlanService } from "./plan.service";

export const createAuthPolicyService = ({
	adminUserDao,
	memberDao,
	plans,
}: {
	adminUserDao: Pick<AdminUserDao, "countUsers" | "findById">;
	memberDao: Pick<
		MemberDao,
		| "listOrgPlansByUser"
		| "findInvitationOrgId"
		| "countByOrg"
		| "countPendingInvitationsByOrg"
	>;
	plans: Pick<PlanService, "getPlanForOrg" | "assertQuota">;
}) => ({
	assertAdminUserMutation: async (
		actorId: string,
		targetId: string,
		action: "set-role" | "ban-user",
	) => {
		if (actorId === targetId)
			throw new ApiError(
				ApiErrorCode.FORBIDDEN,
				"You cannot change your own role or ban yourself",
			);
		if (action === "ban-user") {
			const target = await adminUserDao.findById(targetId);
			if (target?.role?.split(",").includes("admin"))
				throw new ApiError(ApiErrorCode.FORBIDDEN, "You cannot ban an admin");
		}
	},

	initialUserRole: async () =>
		(await adminUserDao.countUsers()) === 0 ? "admin" : "user",

	assertCanCreateOrganization: async (userId: string) => {
		const orgPlans = await memberDao.listOrgPlansByUser(userId);
		const plan = orgPlans.includes("pro") ? "pro" : "free";
		if (orgPlans.length >= PLANS[plan].orgs) {
			throw new ApiError(
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
		await plans.assertQuota(
			orgId,
			"members",
			() => memberDao.countByOrg(orgId),
			{
				message: (plan, limit) =>
					`Plan limit reached: the ${plan} plan allows up to ${limit} members and this organization is full.`,
			},
		);
	},

	assertCanInviteMember: async (orgId: string) => {
		// Seats include pending invitations so invites cannot reserve beyond the limit.
		await plans.assertQuota(
			orgId,
			"members",
			async () =>
				(await memberDao.countByOrg(orgId)) +
				(await memberDao.countPendingInvitationsByOrg(orgId)),
			{
				message: (plan, limit) =>
					`Plan limit reached: the ${plan} plan allows up to ${limit} members (including pending invitations). Upgrade to invite more members.`,
			},
		);
	},
});

export type AuthPolicyService = ReturnType<typeof createAuthPolicyService>;
