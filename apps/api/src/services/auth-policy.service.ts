import { ApiError, ApiErrorCode, PLANS } from "@workspace/shared";
import type { AdminUserDao } from "../dao/admin-user.dao";
import type { MemberDao } from "../dao/member.dao";
import type { OrganizationDao } from "../dao/organization.dao";
import type { PlanAssert, PlanNameSource } from "../lib/ports/plan";

export const createAuthPolicyService = ({
	adminUserDao,
	memberDao,
	organizationDao,
	plans,
	allowFirstUserAdmin = false,
}: {
	adminUserDao: Pick<AdminUserDao, "findById" | "promoteFirstAdmin">;
	memberDao: Pick<
		MemberDao,
		| "listOrgPlansByUser"
		| "findInvitationOrgId"
		| "countByOrg"
		| "countPendingInvitationsByOrg"
	>;
	organizationDao: Pick<OrganizationDao, "findById">;
	plans: PlanNameSource & { assertQuota: PlanAssert };
	/** Explicit opt-in for self-serve deployments; off by default. */
	allowFirstUserAdmin?: boolean;
}) => ({
	assertAdminUserMutation: async (
		actorId: string,
		targetId: string,
		action:
			| "set-role"
			| "ban-user"
			| "remove-user"
			| "set-password"
			| "impersonate"
			| "revoke-sessions",
	) => {
		const blocksSelf =
			action === "set-role" ||
			action === "ban-user" ||
			action === "remove-user";
		if (blocksSelf && actorId === targetId) {
			throw new ApiError(
				ApiErrorCode.FORBIDDEN,
				action === "remove-user"
					? "You cannot remove yourself"
					: "You cannot change your own role or ban yourself",
			);
		}
		if (action === "set-role" || actorId === targetId) return;

		const target = await adminUserDao.findById(targetId);
		if (!target?.role?.split(",").includes("admin")) return;

		const messages: Record<Exclude<typeof action, "set-role">, string> = {
			"ban-user": "You cannot ban an admin",
			"remove-user": "You cannot remove an admin",
			"set-password": "You cannot reset another admin's password",
			impersonate: "You cannot impersonate an admin",
			"revoke-sessions": "You cannot revoke another admin's sessions",
		};
		throw new ApiError(ApiErrorCode.FORBIDDEN, messages[action]);
	},

	/** Promotes the request user only when no admin exists yet, atomically. */
	promoteFirstAdmin: async (userId: string) => {
		if (!allowFirstUserAdmin) return;
		await adminUserDao.promoteFirstAdmin(userId);
	},

	assertOrgNotFrozen: async (orgId: string) => {
		const org = await organizationDao.findById(orgId);
		if (org?.frozen)
			throw new ApiError(ApiErrorCode.ORG_FROZEN, "Organization is frozen");
	},

	assertInvitationNotFrozen: async (invitationId?: string) => {
		if (!invitationId) return;
		const orgId = await memberDao.findInvitationOrgId(invitationId);
		if (orgId) {
			const org = await organizationDao.findById(orgId);
			if (org?.frozen)
				throw new ApiError(ApiErrorCode.ORG_FROZEN, "Organization is frozen");
		}
	},

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
