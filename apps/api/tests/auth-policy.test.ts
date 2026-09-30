import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ApiError,
	ApiErrorCode,
	PLANS,
	type PlanName,
} from "@workspace/shared";
import { createAuthPolicyService } from "../src/services/auth-policy.service";

const policyFor = ({
	users = 1,
	orgPlans = [] as string[],
	members = 0,
	pending = 0,
	plan = "free" as PlanName,
	invitationOrg = "org" as string | null,
} = {}) =>
	createAuthPolicyService({
		adminUserDao: { countUsers: async () => users },
		memberDao: {
			listOrgPlansByUser: async () => orgPlans,
			findInvitationOrgId: async () => invitationOrg,
			countByOrg: async () => members,
			countPendingInvitationsByOrg: async () => pending,
		},
		plans: {
			getPlanForOrg: async () => plan,
		},
	});

const isQuotaError = (error: unknown) =>
	error instanceof ApiError &&
	error.status === 403 &&
	error.code === ApiErrorCode.PLAN_LIMIT_EXCEEDED;

test("only the first registered user receives the admin role", async () => {
	assert.equal(await policyFor({ users: 0 }).initialUserRole(), "admin");
	assert.equal(await policyFor({ users: 1 }).initialUserRole(), "user");
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
