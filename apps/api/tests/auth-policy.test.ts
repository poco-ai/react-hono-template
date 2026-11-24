import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	PLANS,
	type PlanName,
} from "@workspace/shared";
import { createAuthPolicyService } from "../src/core/services/auth-policy.service";
import {
	type QuotaAssert,
	quotaAssertFor,
} from "../src/features/billing/services/plan.service";

const policyFor = ({
	orgPlans = [] as string[],
	members = 0,
	pending = 0,
	plan = "free" as PlanName,
	invitationOrg = "org" as string | null,
	frozen = false,
	allowFirstUserAdmin = false,
	promoted = [] as string[],
	adminRole = null as string | null,
} = {}) =>
	createAuthPolicyService({
		adminUserDao: {
			findById: async (id: string) =>
				adminRole && id === "admin"
					? ({ role: adminRole } as Awaited<
							ReturnType<
								import("../src/core/dao/admin-user.dao").AdminUserDao["findById"]
							>
						>)
					: null,
			promoteFirstAdmin: async (id: string) => {
				promoted.push(id);
			},
		},
		memberDao: {
			listOrgPlansByUser: async () => orgPlans,
			findInvitationOrgId: async () => invitationOrg,
			countByOrg: async () => members,
			countPendingInvitationsByOrg: async () => pending,
		},
		organizationDao: {
			findById: async (orgId: string) =>
				({
					id: orgId,
					frozen,
				}) as Awaited<
					ReturnType<
						import("../src/core/dao/organization.dao").OrganizationDao["findById"]
					>
				>,
		},
		plans: {
			getPlanForOrg: async () => plan,
			assertQuota: async (_orgId: string, ...args: Parameters<QuotaAssert>) =>
				quotaAssertFor(plan)(...args),
		},
		allowFirstUserAdmin,
	});

const isQuotaError = (error: unknown) =>
	error instanceof ApiError &&
	error.status === 403 &&
	error.code === ApiErrorCode.PLAN_LIMIT_EXCEEDED;

const isFrozenError = (error: unknown) =>
	error instanceof ApiError && error.code === ApiErrorCode.ORG_FROZEN;

test("first-user admin promotion is opt-in and only the first user is promoted", async () => {
	const promoted: string[] = [];
	await policyFor({ allowFirstUserAdmin: true, promoted }).promoteFirstAdmin(
		"user-1",
	);
	assert.deepEqual(promoted, ["user-1"]);

	const disabledPromotions: string[] = [];
	await policyFor({ promoted: disabledPromotions }).promoteFirstAdmin("user-2");
	assert.deepEqual(disabledPromotions, []);
});

test("frozen organizations reject writes and invitation acceptance", async () => {
	await assert.rejects(
		policyFor({ frozen: true }).assertOrgNotFrozen("org"),
		isFrozenError,
	);
	await policyFor({ frozen: false }).assertOrgNotFrozen("org");

	await assert.rejects(
		policyFor({ frozen: true }).assertInvitationNotFrozen("invitation"),
		isFrozenError,
	);
	await policyFor({
		frozen: true,
		invitationOrg: null,
	}).assertInvitationNotFrozen("missing");
});

test("organization quota uses the user's existing plans", async () => {
	await policyFor().assertCanCreateOrganization("user");
	await assert.rejects(
		policyFor({
			orgPlans: Array.from({ length: PLANS.free.orgs }, () => "free"),
		}).assertCanCreateOrganization("user"),
		isQuotaError,
	);
	await policyFor({ orgPlans: ["pro"] }).assertCanCreateOrganization("user");
	await assert.rejects(
		policyFor({
			orgPlans: Array.from({ length: PLANS.pro.orgs }, () => "pro"),
		}).assertCanCreateOrganization("user"),
		isQuotaError,
	);
});

test("pending invitations consume seats when sending another invitation", async () => {
	await policyFor({
		members: PLANS.free.members - 2,
		pending: 1,
	}).assertCanInviteMember("org");
	await assert.rejects(
		policyFor({
			members: PLANS.free.members - 1,
			pending: 1,
		}).assertCanInviteMember("org"),
		isQuotaError,
	);
});

test("accepting an invitation counts members without double counting pending seats", async () => {
	await policyFor({
		members: PLANS.free.members - 1,
		pending: 1,
	}).assertCanAcceptInvitation("invitation");
	await assert.rejects(
		policyFor({ members: PLANS.free.members }).assertCanAcceptInvitation(
			"invitation",
		),
		isQuotaError,
	);
	await policyFor({ invitationOrg: null }).assertCanAcceptInvitation("missing");
});

test("auth admin endpoints preserve self-role and administrator-ban restrictions", async () => {
	const policy = policyFor();
	await assert.rejects(
		policy.assertAdminUserMutation("self", "self", "set-role"),
		{ code: ApiErrorCode.FORBIDDEN },
	);
	await assert.rejects(
		policy.assertAdminUserMutation("self", "self", "ban-user"),
		{ code: ApiErrorCode.FORBIDDEN },
	);
	await policy.assertAdminUserMutation("actor", "other", "set-role");
	await assert.rejects(
		policyFor({ adminRole: "admin" }).assertAdminUserMutation(
			"actor",
			"admin",
			"ban-user",
		),
		{ code: ApiErrorCode.FORBIDDEN },
	);
	await assert.rejects(
		policyFor({ adminRole: "user,admin" }).assertAdminUserMutation(
			"actor",
			"admin",
			"ban-user",
		),
		{ code: ApiErrorCode.FORBIDDEN },
	);
	await assert.rejects(
		policyFor({ adminRole: "admin" }).assertAdminUserMutation(
			"actor",
			"admin",
			"remove-user",
		),
		{ code: ApiErrorCode.FORBIDDEN },
	);
	await assert.rejects(
		policyFor({ adminRole: "admin" }).assertAdminUserMutation(
			"actor",
			"admin",
			"set-password",
		),
		{ code: ApiErrorCode.FORBIDDEN },
	);
	await assert.rejects(
		policyFor({ adminRole: "admin" }).assertAdminUserMutation(
			"actor",
			"admin",
			"impersonate",
		),
		{ code: ApiErrorCode.FORBIDDEN },
	);
	await policyFor({ adminRole: "admin" }).assertAdminUserMutation(
		"self",
		"self",
		"set-password",
	);
	await policyFor({ adminRole: "admin" }).assertAdminUserMutation(
		"actor",
		"member",
		"set-password",
	);
});
